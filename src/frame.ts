export class StompFrame {
  contentLength: number;

  constructor(public command: string, public headers: any, public body: string) {
  }

  toString(): string {
    return JSON.stringify({
      command: this.command,
      headers: this.headers,
      body: this.body
    });
  }

  send(stream: any) {
  }
}
