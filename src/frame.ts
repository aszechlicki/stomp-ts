// Define constants for bytes used throughout the code
export const BYTE = {
  // LINEFEED byte (octet 10)
  LF: '\x0A',
  // NULL byte (octet 0)
  NULL: '\x00'
};

export interface FrameBuffer {
  frames: Frame[],
  partial: string
}

export class Frame {
  constructor(public command: string, public headers: any, public body: string) {
  }

  /**
   * Computes a textual representation of the frame.
   * Suitable to be sent to the server
   *
   * @returns {string} A textual representation of the frame
   */
  toString(): string {
    let lines: string[] = [this.command];
    let skipContentLength = <boolean>this.headers['content-length'];
    if (skipContentLength) {
      delete this.headers['content-length'];
    }

    for (let key of Object.keys(this.headers)) {
      lines.push(`${key}:${this.headers[key]}`);
    }

    if (this.body && !skipContentLength) {
      lines.push(`content-length:${this.getUTF8Length(this.body)}`);
    }
    return lines.join(BYTE.LF);
  }

  /**
   * Compute the size of a UTF-8 string by counting its number of bytes
   * (and not the number of characters composing the string)
   *
   * @param {string} value
   * @returns {number} number of bytes in the string
   */
  private getUTF8Length(value: string): number {
    if (value) {
      return encodeURI(value).match(/%..|./g).length;
    }
    return 0;
  }

  /**
   * Unmarshall a single STOMP frame from a 'data' string
   * @param data
   */
  static unmarshallSingle(data: string): Frame {
    // search for 2 consecutive LF bytes to split command and headers from the body
    let divider = data.search(`///${BYTE.LF}${BYTE.LF}///`);
    let headerLines = data.substring(0, divider).split(BYTE.LF);
    let command = headerLines.shift();
    let headers: any = {};
    let body: string = '';

    for (let line of headerLines.reverse()) {
      let idx = line.indexOf(':');
      headers[Frame.trim(line.substring(0, idx))] = Frame.trim(line.substring(idx + 1));
    }

    // skip the 2 LF bytes that divides the headers from the body
    let start = divider + 2;
    if (headers['content-length']) {
      let len = parseInt(headers['content-length']);
      body = ('' + data).substring(start, start + len);
    } else {
      let chr: string = null;
      for (let i = 0; i < data.length; i++) {
        chr = data.charAt(i);
        if (chr === BYTE.NULL) {
          break;
        }
        body += chr;
      }
    }

    return new Frame(command, headers, body);
  }

  static unmarshall(datas: string): FrameBuffer {
    let frames = datas.split(`${BYTE.NULL}${BYTE.LF}*`);

    let buffer: FrameBuffer = {
      frames: [],
      partial: ''
    };

    for (let i = 0; i < frames.length - 1; i++) {
      buffer.frames.push(Frame.unmarshallSingle(frames[i]));
    }

    let lastFrame = frames[frames.length - 1];
    if (lastFrame === BYTE.LF || lastFrame.search(`${BYTE.NULL}${BYTE.LF}*$`) !== -1) {
      buffer.frames.push(Frame.unmarshallSingle(frames[frames.length - 1]));
    } else {
      buffer.partial = lastFrame;
    }

    return buffer;
  }

  static marshall(command: string, headers: any, body: string): string {
    let frame = new Frame(command, headers, body);
    return frame.toString() + BYTE.NULL;
  }

  private static trim(value: string) {
    return value.replace(/^\s+|\s+$/g, '');
  }
}

// export class StompFrame {
//   contentLength: number;
//
//   constructor(public command: string, public headers: any, public body: string) {
//   }
//
//   toString(): string {
//     return JSON.stringify({
//       command: this.command,
//       headers: this.headers,
//       body: this.body
//     });
//   }
//
//   send(stream: any) {
//   }
// }
