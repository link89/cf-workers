import { connect } from 'cloudflare:sockets';

const secret = 'secret';  // Change this to your secret

export default {
    async fetch(request) {
        const upgradeHeader = request.headers.get("Upgrade");
        if (upgradeHeader !== "websocket") {
            return new Response("This is a WebSocket server.", {
                status: 400,
            });
        }

        const authorization = request.headers.get("Authorization");
        if (authorization !== `Bearer ${secret}`) {
            return new Response("secret is not matched", {
                status: 401,
                headers: {
                    'WWW-Authenticate': 'Bearer realm="default", charset="UTF-8"',
                },
            });
        }

        // Create a WebSocket pair
        const [client, server] = Object.values(new WebSocketPair());

        const [hostname, port] = request.headers.get("X-Host").split(":");

        server.accept();
        server.addEventListener('message', ({ data }) => {
            try {
                // use first message to trigger connection
                console.log(`Connecting to ${hostname}:${port}`);
                const socket = connect({ hostname, port });

                new ReadableStream({
                    start(controller) {
                        server.onmessage = ({ data }) => controller.enqueue(data);
                        server.onerror = e => controller.error(e);
                        server.onclose = e => controller.close(e);
                    },
                    cancel(reason) { server.close(); }
                }).pipeTo(socket.writable);

                socket.readable.pipeTo(new WritableStream({
                    start(controller) { server.onerror = e => controller.error(e); },
                    write(chunk) { server.send(chunk); }
                }));

            } catch (error) { server.close(); }
        }, { once: true });

        return new Response(null, { status: 101, webSocket: client });
    }
}