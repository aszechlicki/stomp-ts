import { StompFrame } from "./frame";

class Stomp {
  static unmarshal(data: string): StompFrame {
    let divider = data.search(/\n\n/);
    let headerLines = data.substring(0, divider).split('\n');
    let command = headerLines.shift();
    let body = '';
    let headers = {};

    for (const line of headerLines) {
      line.trim();
      let idx = line.indexOf(':');
      headers[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    }

    for (let i = divider + 2; i < data.length; i++) {
      let chr = data.charAt(i);
      if (chr === '\0') {
        break;
      }
      body += chr;
    }

    return new StompFrame(command, headers, body);
  }

  static marshal(command: string, headers: any, body: string): string {
    return new StompFrame(command, headers, body).toString();
  }
}

export class StompClient {
  private ws: any;
  private counter = 0;
  private subscriptions = {};
  private onReceipt: (frame: StompFrame) => {};
  private onError: (frame: StompFrame) => {};

  constructor(url: string, private login?: string, private passcode?: string, private connectCallback?: (frame: StompFrame) => {}) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";
    this.ws.onmessage = this.onMessage;
    this.ws.onclose = function () {
      this.debug('Lost connection to ' + url);
    };
    this.ws.onopen = () => {
      this.debug('Web Socket connected to ' + url);
      this.transmit('CONNECT', { login: this.login, passcode: this.passcode });
    };
  }

  debug(str: string, ...args: any[]) {
    console.debug(str, args);
  }

  disconnect() {
    this.transmit('DISCONNECT');
    this.ws.close();
  }

  send(destination: string, headers: any = {}, body: string) {
    headers.destination = destination;
    this.transmit('SEND', headers, body);
  }

  subscribe(destination: string, callback: () => {}, headers: any = {}) {
    let id = `sub-${this.counter++}`;
    headers.destination = destination;
    headers.id = id;
    this.subscriptions[id] = callback;
    this.transmit('SUBSCRIBE', headers);
    return id;
  }

  unsubscribe(id: string, headers: any = {}) {
    headers.id = id;
    delete this.subscriptions[id];
    this.transmit('UNSUBSCRIBE', headers);
  }

  begin(transaction: string, headers: any = {}) {
    headers.transaction = transaction;
    this.transmit('BEGIN', headers);
  }

  commit(transaction: string, headers: any = {}) {
    headers.transaction = transaction;
    this.transmit('COMMIT', headers);
  }

  abort(transaction: string, headers: any = {}) {
    headers.transaction = transaction;
    this.transmit('ABORT', headers);
  }

  ack(messageId: string, headers: any = {}) {
    headers['message-id'] = messageId;
    this.transmit('ACK', headers);
  }

  onMessage(evt: any) {
    let data = evt.data;
    let view: any;
    if (data instanceof ArrayBuffer) {
      view = new Uint8Array(data);
      data = "";
      for (let i = 0, len = view.length; i < len; i++) {
        data += String.fromCharCode(view[i]);
      }
    }
    this.debug('<<< ', data);
    let frame = Stomp.unmarshal(data);
    if (frame.command === 'CONNECTED' && this.connectCallback) {
      this.connectCallback(frame);
    } else if (frame.command === 'MESSAGE') {
      let onReceive = this.subscriptions[frame.headers.subscription];
      if (onReceive) {
        onReceive(frame);
      }
    } else if (frame.command === "RECEIPT" && this.onReceipt) {
      this.onReceipt(frame);
    } else if (frame.command === "ERROR" && this.onError) {
      this.onError(frame);
    }
  }

  transmit(command: string, headers?: any, body?: string) {
    let out = Stomp.marshal(command, headers, body);
    this.debug('>>> ', out);
    this.ws.send(out);
  }
}
