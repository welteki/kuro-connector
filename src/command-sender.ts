import { EventEmitter } from 'events';
import * as SerialPort from 'serialport';
import * as Debug from 'debug';
import { CommandQueue } from './command-queue';
const Parser = SerialPort.parsers.Delimiter;
const debug = Debug(`kuro:sender`);

const DELIMITER = '\r';

export enum Command {
  'POWER',
  'SELECT_INPUT',
  'VOLUME',
  'TOGGLE_MUTE',
  'MUTE',
  'UNMUTE'
}

interface ICommandDescriptor {
  cmd: string;
  length: number;
  default?: string;
}

const commands = new Map<Command, ICommandDescriptor>([
  [Command.POWER, { cmd: 'POWR', length: 1, default: '0' }],
  [Command.SELECT_INPUT, { cmd: 'IAVD', length: 1 }],
  [Command.VOLUME, { cmd: 'VOLM', length: 2 }],
  [Command.TOGGLE_MUTE, { cmd: 'MUTE', length: 1, default: '0' }],
  [Command.MUTE, { cmd: 'MUTE', length: 1, default: '1' }],
  [Command.UNMUTE, { cmd: 'MUTE', length: 1, default: '2' }]
]);

export const buildCommand = (cmd: Command, param: string = ''): Buffer => {
  const buf = Buffer.alloc(9, 'ascii')
    .fill('0')
    .fill(DELIMITER, 8);

  let command: ICommandDescriptor | undefined = commands.get(cmd);
  if (!command) throw new Error(`Invalid command: ${cmd}`);
  buf.fill(command.cmd, 0, 4);

  if (param === '' && command.default) {
    buf.fill(command.default, 8 - command.length, 8);
    return buf;
  }

  if (param === 'state' || param === '') {
    buf.fill('?', 4, 8);
    return buf;
  }

  if (param.length > command.length) {
    throw new Error(
      `Invalid command parameter, cmd: ${Command[cmd]}, param: ${param}`
    );
  } else {
    buf.fill(param, 8 - command.length, 8);
    return buf;
  }
};

export interface SenderOptions {
  commandTimeout?: number;
  pollInterval?: number;
}

export class CommandSender extends EventEmitter {
  private readonly _stream: SerialPort;
  private readonly _parser: SerialPort.parsers.Delimiter;
  private readonly _commandQueue: CommandQueue<Buffer>;
  private readonly _options: SenderOptions;
  private _connected: boolean = false;
  private _pollTimeout: NodeJS.Timeout;

  constructor(stream: SerialPort, options?: SenderOptions) {
    super();
    this._options = {
      commandTimeout: 50,
      pollInterval: 6000,
      ...options
    };

    let parser = new Parser({ delimiter: DELIMITER });

    this._commandQueue = new CommandQueue();
    this._stream = stream;
    this._parser = parser;

    stream.on('error', this._onError.bind(this));
    stream.on('open', this._startPolling.bind(this));
    parser.on('data', this._onResponse.bind(this));

    stream.pipe(parser);
  }

  static createSender(port: string, options?: SenderOptions): CommandSender {
    const stream = new SerialPort(port, {
      autoOpen: false,
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    });

    return new CommandSender(stream, options);
  }

  async sendCommand(
    cmd: Command,
    param: 'state' | string = ''
  ): Promise<Buffer> {
    return this._commandQueue.add(
      () => {
        this._write(cmd, param);
      },
      { timeout: this._options.commandTimeout }
    );
  }

  connect(callback?: (err?: Error) => void): void {
    debug('Opening connection');
    this._stream.open(callback);
  }

  end(): void {
    debug('Closing connection');
    this._stream.close();
    this.emit('end');
  }

  get connected(): boolean {
    return this._connected;
  }

  private _write(cmd: Command, param: string): void {
    debug(`sender.send command:${Command[cmd]} param:${param}`);
    try {
      if (!this._stream.isOpen)
        throw new Error('Open serial stream to start sending commands');

      let command = buildCommand(cmd, param);
      this._stream.write(command, err => {
        if (err) {
          throw err;
        }
      });
    } catch (err) {
      debug(`sender.send command error`);
      throw err;
    }
  }

  private async _pollConnection(): Promise<void> {
    debug(`sender.poll poll started`);
    const { pollInterval, commandTimeout } = this._options;

    try {
      await this._commandQueue.add(
        () => {
          this._write(Command.POWER, 'state');
        },
        {
          priority: 1,
          timeout: pollInterval! - commandTimeout!
        }
      );
      debug(`sender.poll poll finished`);
      this._setConnectionStatus(true);
    } catch (err) {
      debug(`sender.poll poll finished`);
      this._setConnectionStatus(false);
    }
  }

  private _startPolling() {
    debug('Starting connection poll');

    const poll = () => {
      if (this._stream.isOpen) {
        this._pollConnection();
        this._pollTimeout = setTimeout(poll, this._options.pollInterval!);
      } else {
        clearTimeout(this._pollTimeout);
      }
    };

    poll();
  }

  private _setConnectionStatus(status: boolean) {
    debug(`Updating connection status to ${status}`);

    if (status && !this.connected) this.emit('connect');
    if (!status && this.connected) this.emit('close');
    this._connected = status;
  }

  private _onResponse(res: Buffer): void {
    let { current } = this._commandQueue;
    if (!current) return;

    let response = res.toString();

    if (response === 'ERR') {
      debug('sender.send command failed');
      let err = Error(`Command failed`);
      current.reject(err);
      return;
    }

    debug(`sender.send command succes, res:${res}`);
    current.resolve(res);
  }

  private _onError(err: Error): void {
    this.emit('error', err);
  }
}
