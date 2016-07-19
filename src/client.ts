import { Frame, BYTE } from "./frame";
export const Stomp = {
  VERSIONS: {
    V1_0: '1.0',
    V1_1: '1.1',
    V1_2: '1.2'
  },
  supportedVersions: '1.1,1.0',
  client: (url: string, protocols: string[] = ['v10.stomp', 'v11.stomp']) => {
    return new Client(new WebSocket(url, protocols));
  }
  // TODO: Stomp.over - consider if still needed
};

export interface StompConfig {
  headers?: any;
  connectCallback?: (frame: Frame) => {};
  receiptCallback?: (frame: Frame) => {};
  errorCallback?: (frame: Frame) => {};
  login?: string;
  passcode?: string;
  host: string;
}

export const STOMP_COMMANDS = {
  ACK: 'ACK',
  NACK: 'NACK',
  ABORT: 'ABORT',
  BEGIN: 'CONNECT',
  COMMIT: 'COMMIT',
  CONNECT: 'CONNECT',
  CONNECTED: 'CONNECTED',
  DISCONNECT: 'DISCONNECT',
  MESSAGE: 'MESSAGE',
  RECEIPT: 'RECEIPT',
  SUBSCRIBE: 'SUBSCRIBE',
  UNSUBSCRIBE: 'UNSUBSCRIBE',
  SEND: 'SEND',
  ERROR: 'ERROR'
};

export class Client {
  private counter: number = 0;
  private connected: boolean = false;
  private heartbeat = {
    outgoing: 10000,
    incoming: 10000
  };
  private serverActivity: number;
  private pinger: number;
  private ponger: number;
  private partialData: string;
  private connectCallback: (frame: Frame) => {};
  private errorCallback: (error: Frame|string|Error) => {};
  private onreceipt: (frame: Frame) => {};
  /**
   * maximum *WebSocket* frame size sent by the client. If the STOMP frame
   * is bigger than this value, the STOMP frame will be sent using multiple
   * WebSocket frames (default is 16KiB)
   * @type {number}
   */
  private maxWebSocketFrameSize = 16 * 1024;
  private subscriptions: any = {};

  constructor(private ws: WebSocket) {
    this.ws.binaryType = 'arraybuffer';
  }

  connect(config: StompConfig) {
    if (!config.headers) {
      config.headers = {}
    }
    if (config.login) {
      config.headers.login = config.login;
    }
    if (config.passcode) {
      config.headers.passcode = config.passcode;
    }
    if (config.connectCallback) {
      this.connectCallback = config.connectCallback;
    }
    if (config.errorCallback) {
      this.errorCallback = config.errorCallback;
    }
    if (config.receiptCallback) {
      this.onreceipt = config.receiptCallback;
    }

    this.debug('Opening WebSocket');
    this.ws.onmessage = (evt: MessageEvent) => {
      let data: string;
      if (typeof ArrayBuffer && evt.data instanceof ArrayBuffer) {
        let arr = new Uint8Array(evt.data);
        this.debug('--- got data length: ', arr.length);
        let stringArray: string[] = [];
        arr.forEach(val => stringArray.push(String.fromCharCode(val)));
        data = stringArray.join('');
      } else {
        // take data directly from WebSocket 'data' field
        data = evt.data;
      }
      this.serverActivity = Date.now();

      // heartbeat
      if (data === BYTE.LF) {
        this.debug('<<< PONG');
        return;
      }

      this.debug('<<< ', data);

      // handle STOMP frames received from the server
      // the unmarshall function returns the frames parsed and any remaining data from partial frames
      let unmarshalledData = Frame.unmarshall(data);

      unmarshalledData.frames.forEach(this.handleFrame);
    };

    this.ws.onclose = () => {
      const message = `Lost connection to ${this.ws.url}`;
      this.debug(message);
      this.cleanup();
      if (this.errorCallback) {
        this.errorCallback(message);
      }
    };

    this.ws.onopen = () => {
      this.debug('WebSocket opened');
      let headers = {
        'accept-version': Stomp.supportedVersions,
        'heart-beat': [this.heartbeat.outgoing, this.heartbeat.incoming].join(',')
      };
      this.transmit(STOMP_COMMANDS.CONNECT, headers);
    };
  }

  debug(message: string, ...args: any[]) {
    console.log(message, args);
  }

  /**
   * [DISCONNECT Frame](http://stomp.github.com/stomp-specification-1.1.html#DISCONNECT)
   * @param disconnectCallback
   * @param headers
   */
  disconnect(disconnectCallback: ()=>{}, headers: any) {
    this.transmit(STOMP_COMMANDS.DISCONNECT, headers);
    this.ws.onclose = null;
    this.ws.close();
    this.cleanup();
    disconnectCallback();
  }

  /**
   * [SEND Frame](http://stomp.github.com/stomp-specification-1.1.html#SEND)
   * @param destination
   * @param headers
   * @param body
   */
  send(destination: string, headers: any, body: string): any {
    headers.destination = destination;
    this.transmit(STOMP_COMMANDS.SEND, headers, body);
    return {
      id: headers.id,
      unsubscribe: () => {
        this.unsubscribe(headers.id);
      }
    };
  }

  /**
   * [SUBSCRIBE Frame](http://stomp.github.com/stomp-specification-1.1.html#SUBSCRIBE)
   * @param destination
   * @param callback
   * @param headers
   */
  subscribe(destination: string, callback: () => {}, headers: any) {
    if (!headers.id) {
      headers.id = `sub-${this.counter++}`;
    }
    headers.destination = destination;
    this.transmit(STOMP_COMMANDS.SUBSCRIBE, headers);
  }

  /**
   * [UNSUBSCRIBE Frame](http://stomp.github.com/stomp-specification-1.1.html#UNSUBSCRIBE)
   * @param id
   */
  unsubscribe(id: string) {
    delete this.subscriptions[id];
    this.transmit(STOMP_COMMANDS.UNSUBSCRIBE, {
      id: id
    });
  }

  /**
   * [ABORT Frame](http://stomp.github.com/stomp-specification-1.1.html#ABORT)
   * @param transaction
   */
  abort(transaction: string) {
    this.transmit(STOMP_COMMANDS.ABORT, {
      transaction: transaction
    });
  }

  /**
   * [BEGIN Frame](http://stomp.github.com/stomp-specification-1.1.html#BEGIN)
   * @param transaction
   */
  begin(transaction: string) {
    let txid = transaction || `tx-${this.counter++}`;
    this.transmit(STOMP_COMMANDS.BEGIN, {
      transaction: txid
    });
    return {
      id: txid,
      commit: () => {
        this.commit(txid);
      },
      abort: () => {
        this.abort(txid);
      }
    }
  }

  /**
   * [COMMIT Frame](http://stomp.github.com/stomp-specification-1.1.html#COMMIT)
   * @param transaction
   */
  commit(transaction: string) {
    this.transmit(STOMP_COMMANDS.COMMIT, {
      transaction: transaction
    });
  }

  /**
   * [ACK Frame](http://stomp.github.com/stomp-specification-1.1.html#ACK)
   * @param messageId
   * @param subscription
   * @param headers
   */
  ack(messageId: string, subscription: string, headers: any) {
    headers['message-id'] = messageId;
    headers.subscription = subscription;
    this.transmit(STOMP_COMMANDS.ACK, headers);
  }

  /**
   * [NACK Frame](http://stomp.github.com/stomp-specification-1.1.html#NACK)
   * @param messageId
   * @param subscription
   * @param headers
   */
  nack(messageId: string, subscription: string, headers: any) {
    headers['message-id'] = messageId;
    headers.subscription = subscription;
    this.transmit(STOMP_COMMANDS.NACK, headers);
  }

  private cleanup() {
    this.connected = false;
    clearInterval(this.pinger);
    clearInterval(this.ponger);
  }

  private handleFrame(frame: Frame) {
    switch (frame.command) {
      // [CONNECTED Frame](http://stomp.github.com/stomp-specification-1.1.html#CONNECTED_Frame)
      case STOMP_COMMANDS.CONNECTED:
        this.debug(`connected to server `, frame.headers.server);
        this.connected = true;
        this.setupHeartbeat(frame.headers);
        if (this.connectCallback) {
          this.connectCallback(frame);
        }
        break;
      // [MESSAGE Frame](http://stomp.github.com/stomp-specification-1.1.html#MESSAGE)
      case STOMP_COMMANDS.MESSAGE:
        // the `onreceive` callback is registered when the client calls
        // `subscribe()`.
        // If there is registered subscription for the received message,
        // we used the default `onreceive` method that the client can set.
        // This is useful for subscriptions that are automatically created
        // on the browser side (e.g. [RabbitMQ's temporary
        // queues](http://www.rabbitmq.com/stomp.html)).
        let subscription = frame.headers.subscription;
        let onreceive = this.subscriptions[subscription];
        if (onreceive) {
          // TODO: think of some other way to do that
          // add 'ack' and 'nack' methods directly to the returned frame so a simple call to 'message.ack' can acknowledge the message
          // let messageId = frame.headers['message-id'];
          // frame.ack = (headers = {}) => {
          //   this.ack(messageId, subscription, headers);
          // };
          // frame.nack = (headers = {}) => {
          //   this.ack(messageId, subscription, headers);
          // };
          onreceive(frame);
        }
        break;
      //[RECEIPT Frame](http://stomp.github.com/stomp-specification-1.1.html#RECEIPT)
      //
      // The client instance can set its `onreceipt` field to a function taking
      // a frame argument that will be called when a receipt is received from
      // the server:
      //
      //     client.onreceipt = function(frame) {
      //       receiptID = frame.headers['receipt-id'];
      //       ...
      //     }
      case STOMP_COMMANDS.RECEIPT:
        if (this.onreceipt) {
          this.onreceipt(frame);
        }
        break;
      case STOMP_COMMANDS.ERROR:
        if (this.errorCallback) {
          this.errorCallback(frame);
        }
        this.debug('error received: ', frame);
        break;
      default:
        throw new Error(`not supported STOMP command ${frame.command}`);
    }
  }

  private transmit(command: string, headers: any, body?: string): void {
    let out = Frame.marshall(command, headers, body);
    this.debug(">>> ", out);
    while (out.length > this.maxWebSocketFrameSize) {
      this.ws.send(out.substring(0, this.maxWebSocketFrameSize));
      out = out.substring(this.maxWebSocketFrameSize);
      this.debug("remaining = ", out.length);
    }
    this.ws.send(out);
  }

  private setupHeartbeat(headers: any) {
    if (!headers.version || headers.version === Stomp.VERSIONS.V1_0) {
      return;
    }

    // heart-beat header received from the server looks like:
    // heart-beat: sx, sy
    const heartBeat = headers['heart-beat'].split(',').map(parseInt);
    const serverIncoming = heartBeat[0];
    const serverOutgoing = heartBeat[1];

    if (this.heartbeat.outgoing !== 0 && serverOutgoing !== 0) {
      let ttl = Math.max(this.heartbeat.outgoing, serverOutgoing);
      this.debug(`Check PING every ${ttl}ms`);
      this.pinger = setInterval(() => {
        this.ws.send(BYTE.LF);
        this.debug('>>> PING');
      }, ttl);
    }

    if (this.heartbeat.incoming !== 0 && serverIncoming !== 0) {
      let ttl = Math.max(this.heartbeat.incoming, serverIncoming);
      this.debug(`check PONG every ${ttl}ms`);
      this.ponger = setInterval(() => {
        let delta = Date.now() - this.serverActivity;
        if (delta > ttl * 2) {
          this.debug(`Did not receive server activity for the last ${delta}ms`);
          this.ws.close();
        }
      }, ttl);
    }
  }
}
