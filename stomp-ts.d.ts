declare module 'stomp-ts/src/frame' {
	export const BYTE: {
	    LF: string;
	    NULL: string;
	};
	export interface FrameBuffer {
	    frames: Frame[];
	    partial: string;
	}
	export class Frame {
	    command: string;
	    headers: any;
	    body: string;
	    constructor(command: string, headers: any, body: string);
	    /**
	     * Computes a textual representation of the frame.
	     * Suitable to be sent to the server
	     *
	     * @returns {string} A textual representation of the frame
	     */
	    toString(): string;
	    /**
	     * Compute the size of a UTF-8 string by counting its number of bytes
	     * (and not the number of characters composing the string)
	     *
	     * @param {string} value
	     * @returns {number} number of bytes in the string
	     */
	    private getUTF8Length(value);
	    /**
	     * Unmarshall a single STOMP frame from a 'data' string
	     * @param data
	     */
	    static unmarshallSingle(data: string): Frame;
	    static unmarshall(datas: string): FrameBuffer;
	    static marshall(command: string, headers: any, body: string): string;
	    private static trim(value);
	}

}
declare module 'stomp-ts/src/client' {
	import { Frame } from 'stomp-ts/src/frame';
	export const Stomp: {
	    VERSIONS: {
	        V1_0: string;
	        V1_1: string;
	        V1_2: string;
	    };
	    supportedVersions: string;
	    client: (url: string, protocols?: string[]) => Client;
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
	export const STOMP_COMMANDS: {
	    ACK: string;
	    NACK: string;
	    ABORT: string;
	    BEGIN: string;
	    COMMIT: string;
	    CONNECT: string;
	    CONNECTED: string;
	    DISCONNECT: string;
	    MESSAGE: string;
	    RECEIPT: string;
	    SUBSCRIBE: string;
	    UNSUBSCRIBE: string;
	    SEND: string;
	    ERROR: string;
	};
	export class Client {
	    private ws;
	    private counter;
	    private connected;
	    private heartbeat;
	    private serverActivity;
	    private pinger;
	    private ponger;
	    private partialData;
	    private connectCallback;
	    private errorCallback;
	    private onreceipt;
	    /**
	     * maximum *WebSocket* frame size sent by the client. If the STOMP frame
	     * is bigger than this value, the STOMP frame will be sent using multiple
	     * WebSocket frames (default is 16KiB)
	     * @type {number}
	     */
	    private maxWebSocketFrameSize;
	    private subscriptions;
	    constructor(ws: WebSocket);
	    connect(config: StompConfig): void;
	    debug(message: string, ...args: any[]): void;
	    /**
	     * [DISCONNECT Frame](http://stomp.github.com/stomp-specification-1.1.html#DISCONNECT)
	     * @param disconnectCallback
	     * @param headers
	     */
	    disconnect(disconnectCallback: () => {}, headers: any): void;
	    /**
	     * [SEND Frame](http://stomp.github.com/stomp-specification-1.1.html#SEND)
	     * @param destination
	     * @param headers
	     * @param body
	     */
	    send(destination: string, headers: any, body: string): any;
	    /**
	     * [SUBSCRIBE Frame](http://stomp.github.com/stomp-specification-1.1.html#SUBSCRIBE)
	     * @param destination
	     * @param callback
	     * @param headers
	     */
	    subscribe(destination: string, callback: () => {}, headers: any): void;
	    /**
	     * [UNSUBSCRIBE Frame](http://stomp.github.com/stomp-specification-1.1.html#UNSUBSCRIBE)
	     * @param id
	     */
	    unsubscribe(id: string): void;
	    /**
	     * [ABORT Frame](http://stomp.github.com/stomp-specification-1.1.html#ABORT)
	     * @param transaction
	     */
	    abort(transaction: string): void;
	    /**
	     * [BEGIN Frame](http://stomp.github.com/stomp-specification-1.1.html#BEGIN)
	     * @param transaction
	     */
	    begin(transaction: string): {
	        id: string;
	        commit: () => void;
	        abort: () => void;
	    };
	    /**
	     * [COMMIT Frame](http://stomp.github.com/stomp-specification-1.1.html#COMMIT)
	     * @param transaction
	     */
	    commit(transaction: string): void;
	    /**
	     * [ACK Frame](http://stomp.github.com/stomp-specification-1.1.html#ACK)
	     * @param messageId
	     * @param subscription
	     * @param headers
	     */
	    ack(messageId: string, subscription: string, headers: any): void;
	    /**
	     * [NACK Frame](http://stomp.github.com/stomp-specification-1.1.html#NACK)
	     * @param messageId
	     * @param subscription
	     * @param headers
	     */
	    nack(messageId: string, subscription: string, headers: any): void;
	    private cleanup();
	    private handleFrame(frame);
	    private transmit(command, headers, body?);
	    private setupHeartbeat(headers);
	}

}
