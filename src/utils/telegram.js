async function approveChatJoinRequest(chatId, userId) {
  return await fetch(
    `https://api.telegram.org/bot${bot_token}/approveChatJoinRequest`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        user_id: userId,
      }),
    }
  );
};

async function declineChatJoinRequest(chatId, userId) {
  return await fetch(
    `https://api.telegram.org/bot${bot_token}/declineChatJoinRequest`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        user_id: userId,
      }),
    }
  );
};

async function sendMessage(chatId, text) {
  return await fetch(
    `https://api.telegram.org/bot${bot_token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    }
  );
};

async function verifyInitData(params, hash) {
	params.delete("hash");
	const entries = Array.from(params.entries()).sort((a, b) => {
		if (a[0] < b[0]) return -1
		if (a[0] > b[0]) return 1
		return 0
	});
	const dataCheckString = entries
		.map(([key, value]) => `${key}=${value}`)
		.join('\n');
	const encoder = new TextEncoder();
	const webAppDataKey = await crypto.subtle.importKey(
		'raw',
		encoder.encode('WebAppData'),
		{
			name: 'HMAC',
			hash: 'SHA-256'
		},
		false,
		['sign']
	);
	const secretKeyBuffer = await crypto.subtle.sign(
		'HMAC',
		webAppDataKey,
		encoder.encode(bot_token)
	);
	const hmacKey = await crypto.subtle.importKey(
		'raw',
		secretKeyBuffer,
		{
			name: 'HMAC',
			hash: 'SHA-256'
		},
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign(
		'HMAC',
		hmacKey,
		encoder.encode(dataCheckString)
	);
	const calculatedHash = Array.from(new Uint8Array(signature))
	    .map(b => b.toString(16).padStart(2, '0'))
	    .join('');
    return calculatedHash === hash.toLowerCase();
}