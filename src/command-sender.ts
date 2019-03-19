import { EventEmitter } from 'events';
import * as SerialPort from 'serialport';
import { CommandQueue } from './command-queue';
const Parser = SerialPort.parsers.Delimiter;

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

export class CommandSender extends EventEmitter {
  private _stream: SerialPort;
  private _parser: SerialPort.parsers.Delimiter;
  private _commandQueue: CommandQueue<Buffer>;

  constructor(stream: SerialPort) {
    super();
    let parser = new Parser({ delimiter: DELIMITER });

    this._commandQueue = new CommandQueue();
    this._stream = stream;
    this._parser = parser;

    stream.on('error', this._onError.bind(this));
    parser.on('data', this._onResponse.bind(this));

    stream.pipe(parser);
  }

  static createSender(port: string, timeout?: number): CommandSender {
    const stream = new SerialPort(port, {
      autoOpen: false,
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    });

    return new CommandSender(stream);
  }

  async sendCommand(
    cmd: Command,
    param: 'state' | string = 'state'
  ): Promise<Buffer> {
    if (!this._stream.isOpen)
      throw new Error('Open serial stream to start sending commands');

    return this._commandQueue.add(() => {
      let command = buildCommand(cmd, param);
      this._stream.write(command, err => {
        if (err) throw err;
      });
    });
  }

  open(callback?: (err?: Error) => void): void {
    this._stream.open(err => {
      if (err) {
        this.emit('error', err);
        if (callback) callback(err);
      } else {
        this.emit('open');
        if (callback) callback();
      }
    });
  }

  close(): void {
    this._stream.close();
  }

  private _onResponse(res: Buffer): void {
    let { current } = this._commandQueue;
    if (!current) return;

    let response = res.toString();

    if (response === 'ERR') {
      let err = Error(`Command failed`);
      current.reject(err);
      return;
    }

    current.resolve(res);
  }

  private _onError(err: Error): void {
    this.emit('error', err);
  }
}
