const replies = require('./../replies.js');

export async function antiRobot(ai, path) {
    try {
        const messages = [
            { role: "system", content: replies['other']['unknown_path_tips'] },
            { role: "user", content: path },
        ];
        const stream = await ai.run("@cf/qwen/qwen2.5-coder-32b-instruct", {
            messages,
            stream: true,
            seed: 1145141919
        });
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let rawBuffer = "";
        let generatedText = "";
        let isMatched = false;
        const parseChunk = (chunk) => {
            rawBuffer += decoder.decode(chunk, { stream: true });
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
                            generatedText += parsed.response || "";
                        } catch (e) {
                            console.error("ANTIBOT JSON PARSE ERROR", data);
                        }
                    }
                }
            }
        };
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            parseChunk(value);
            if (/4\s*0*\s*4\s+page\s+not\s+found/i.test(generatedText)) {
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
                    "Content-Disposition": 'attachment',
                    "Content-Length": String(size),
                    "Cache-Control": "no-store",
                },
            });
        } else {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                parseChunk(value);
            }
            return new Response(generatedText, {
                headers: { 
                    "Content-Type": "text/plain; charset=utf-8",
                    "Cache-Control": "no-store"
                },
                status: 200
            });
        }
    } catch(e) {
        console.error("ANTI ROBOT ERROR", e);
        return new Response("404 page not found", { status: 404 });
    }
}
