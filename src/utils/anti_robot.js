const replies = require('./../replies.js');

export async function antiRobot(ai, path) {
    try {
        const messages = [
            { role: "system", content: replies['other']['unknown_path_tips'] },
            { role: "user", content: path },
        ];
        const stream = await ai.run("@cf/qwen/qwq-32b", {
            messages,
            stream: true,
            seed: 1145141919
        });
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let rawBuffer = "";
        let generatedText = "";
        let cachedChunks = [];
        let isMatched = false;
        let isStreamDone = false;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            cachedChunks.push(value);
            rawBuffer += decoder.decode(value, { stream: true });
            const parts = rawBuffer.split("\n\n");
            rawBuffer = parts.pop() || "";
            for (const part of parts) {
                const lines = part.split("\n");
                for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const data = line.slice(6);
                    if (data === "[DONE]") continue;
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.response || "";
                        generatedText += content;
                    } catch (e) {}
                }
                }
            }

            const is404 = /404\s+page\s+not\s+found/i.test(generatedText);
            if (is404) {
                isMatched = true;
                break;
            }

            if (generatedText.length >= 18) {
                break;
            }
        }
        if (isMatched) {
            await reader.cancel(); 
            const size = 1024 * 1024;
            const bytes = new Uint8Array(size);
            const CHUNK_SIZE = 65536;
            for (let offset = 0; offset < size; offset += CHUNK_SIZE) {
                const length = Math.min(CHUNK_SIZE, size - offset);
                crypto.getRandomValues(bytes.subarray(offset, offset + length));
            }
            return new Response(bytes, {
                headers: {
                    "Content-Type": "application/octet-stream",
                    "Content-Disposition": 'attachment; filename="random-1mb.bin"',
                    "Content-Length": String(size),
                    "Cache-Control": "no-store",
                },
            });
        } else {
            const combinedStream = new ReadableStream({
                start(controller) {
                for (const chunk of cachedChunks) {
                    controller.enqueue(chunk);
                }
                },
                async pull(controller) {
                    if (isStreamDone) {
                        controller.close();
                        return;
                    }
                    const { done, value } = await reader.read();
                    if (done) {
                        isStreamDone = true;
                        controller.close();
                    } else {
                        controller.enqueue(value);
                    }
                },
                cancel() {
                return reader.cancel();
                }
            });
            return new Response(combinedStream, {
                headers: { "content-type": "text/event-stream" },
                status: 200
            });
        }
    } catch {
        return new Response("404 page not found", { status: 404 });
    }
}