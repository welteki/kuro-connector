import { EventEmitter } from 'events';
import * as SerialPort from 'serialport';
import { isNull } from 'util';
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

interface ICommand {
  cmd: string;
  length: number;
  default?: string;
}

const commands = new Map<Command, ICommand>([
  [Command.POWER, { cmd: 'POWR', length: 1, default: '0' }],
  [Command.SELECT_INPUT, { cmd: 'IAVD', length: 1 }],
  [Command.VOLUME, { cmd: 'VOLM', length: 2 }],
  [Command.TOGGLE_MUTE, { cmd: 'MUTE', length: 1, default: '0' }],
  [Command.MUTE, { cmd: 'MUTE', length: 1, default: '1' }],
  [Command.UNMUTE, { cmd: 'MUTE', length: 1, default: '2' }]
]);

const buildCommand = (cmd: Command, param: string = ''): Buffer => {
  const buf = Buffer.alloc(9, 'ascii')
    .fill('0')
    .fill(DELIMITER, 8);

  let command: ICommand | undefined = commands.get(cmd);
  if (!command) throw new Error(`Invalid command: ${cmd}`);
  buf.fill(command.cmd, 0, 4);

  if (param === '' && command.default) {
    buf.fill(command.default, 8 - command.length, 8);
    return buf;
  }

  if (param === 'state' || param === '')
  {
    buf.fill('?', 4, 8);
    return buf;
  }

  if (param.length > command.length) {
    throw new Error(
      `Invalid command parameter, cmd: ${Command[cmd]}, param: ${param}`
    );
  } else {
    buf.fill(param, 8 - command.length, 8);
    return buf
  }
};

export class CommandSender extends EventEmitter {
  private _stream: SerialPort;
  private _parser: SerialPort.parsers.Delimiter;

  constructor(stream: SerialPort) {
    super();
    stream.on('error', this._onError.bind(this));
    this._stream = stream;

    let parser = new Parser({ delimiter: DELIMITER });
    parser.on('data', this._onResponse.bind(this));
    this._parser = parser;

    stream.pipe(parser);
  }

  static createSender(port: string): CommandSender {
    const stream = new SerialPort(port, {
      // autoOpen: false,
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    }, (err) => {
      console.log('port opened');
    });

    return new CommandSender(stream);
  }

  sendCommand(cmd: Command, param?: 'state' | string): void {
    this._stream.write(buildCommand(cmd, param), err => {
      if (err) this.emit('error', err);
    });
  }

  close(): void {
    this._stream.close();
  }

  private _onResponse(res: Buffer): void {
    let response = res.toString();
    this.emit('data', response);
  }

  private _onError(err: Error): void {
    this.emit('error', err);
  }
}
