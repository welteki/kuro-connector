import { EventEmitter } from 'events';
import { CommandSender, Command } from './command-sender';

export interface KuroOptions {
  autoConnect?: boolean;
}

/**
 * Kuro controller.
 */
export class Kuro extends EventEmitter {
  private readonly _commandSender: CommandSender;
  private readonly _options: KuroOptions;

  /**
   * Create kuro controller.
   *
   * @param port - Path to serial port
   * @param options - Kuro options
   */
  constructor(port: string, options: KuroOptions) {
    super();
    this._options = {
      autoConnect: true,
      ...options
    };

    let commandSender = CommandSender.createSender(port);
    this._commandSender = commandSender;

    commandSender.on('connect', () => this.emit('connect'));
    commandSender.on('close', () => this.emit('close'));
    commandSender.on('end', () => this.emit('end'));
    commandSender.on('error', err => this.emit('error', err));

    if (this._options.autoConnect) commandSender.connect();
  }

  /**
   * Opens connection to device.
   */
  connect(): void {
    this._commandSender.connect();
  }

  /**
   * Ends connection to device.
   */
  end(): void {
    this._commandSender.end();
  }

  /**
   * Turns of the device.
   */
  async powerOff(): Promise<void> {
    try {
      await this._commandSender.sendCommand(Command.POWER, '0');
    } catch (err) {
      if (err.message !== 'Command timed out') throw err;
      return;
    }
  }

  /**
   * Gets device input channel.
   */
  async getInput(): Promise<number> {
    let res = await this._commandSender.sendCommand(
      Command.SELECT_INPUT,
      'state'
    );
    return parseInt(res.toString());
  }

  /**
   * Sets device input channel.
   *
   * @param input - number from 1-8
   */
  async setInput(input: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): Promise<void> {
    await this._commandSender.sendCommand(
      Command.SELECT_INPUT,
      input.toString()
    );
  }

  /**
   * Gets device volume.
   */
  async getVolume(): Promise<number> {
    let res = await this._commandSender.sendCommand(Command.VOLUME, 'state');
    return parseInt(res.toString());
  }

  /**
   * Sets device volume.
   * @param volume - number from 0-100
   */
  async setVolume(volume: number): Promise<void> {
    await this._commandSender.sendCommand(Command.VOLUME, volume.toString());
  }

  /**
   * Gets device mute state.
   */
  async getMuted(): Promise<boolean> {
    let res = await this._commandSender.sendCommand(
      Command.TOGGLE_MUTE,
      'state'
    );
    return res.toString() == '1';
  }

  /**
   * Sets device mute state.
   *
   * @param muted
   */
  async setMuted(muted: boolean): Promise<void> {
    muted
      ? await this._commandSender.sendCommand(Command.MUTE)
      : await this._commandSender.sendCommand(Command.UNMUTE);
  }

  /**
   *  Connection status - `true` if connected to device and
   *    device is turned on.
   */
  get isConnected() {
    return this._commandSender.connected;
  }
}
