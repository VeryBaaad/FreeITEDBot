export async function getGitHubBanResult(ghkv, ghId) {
    const ghData = await ghkv.get(String(ghId), "json");
    return ghData?.banResult || "leak";
}

export async function getTelegramBanResult(tgkv, tgId) {
    const tgData = await tgkv.get(String(tgId), "json");
    return tgData?.banResult || "leak";
}

export async function banTelegramAccount(tgkv, id, result, chatid) {
    let tgData = await tgkv.get(String(id), "json");
    if (tgData === null) {
        tgData = {
            github: 0
        }
    }
    tgData.ban = true;
    tgData.banResult = result || "leak";
    await tgkv.put(String(id), JSON.stringify(tgData));
    await fetch(`https://api.telegram.org/bot${bot_token}/banChatMember`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            chat_id: chatid,
            user_id: id
        })
    });
}

export async function banGitHubAccount(ghkv, id, result) {
    let ghData = await ghkv.get(String(id), "json");
    if (ghData === null) {
        ghData = {
            telegram: 0
        }
    }
    ghData.ban = true;
    ghData.banResult = result || "leak";
    await ghkv.put(String(id), JSON.stringify(ghData));
}

export async function findGitHubToTelegram(ghkv, ghId) {
    const ghData = await ghkv.get(String(ghId), "json");
    return ghData?.telegram;
} 

export async function isTgBanned(tgkv, id) {
    const tgData = await tgkv.get(String(id), "json");
    return tgData?.ban === true;
}

export async function isGhBanned(ghkv, id) {
    const ghData = await ghkv.get(String(id), "json");
    return ghData?.ban === true;
}

export async function isUserAdmin(adminusers, id) {
    return adminusers.split(',').includes(String(id));
}

export async function escapeMarkdownV2(text) {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}