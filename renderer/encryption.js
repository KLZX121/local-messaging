function randStr(length) {
    let result = '';
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < length; i++){
       result += characters.charAt(Math.floor(Math.random() * characters.length));
    };
    return result;
};

function createKey(keyLength, charLength = 10){
    let key = '';
    for (let i = 0; i < keyLength; i++){
        let str = randStr(charLength);
        while (key.indexOf(str) !== -1) {
            str = randStr(charLength);
        };
        key += str;
    };
    return key;
};

function encrypt(key, plainStr, charLength = 10){
    let encryptedStr = '';
    for (const char of plainStr){
        const charCode = char.charCodeAt(0);
        encryptedStr += key.slice(charCode * charLength, charCode * charLength + charLength);
    };
    return encryptedStr;
};

function decrypt(key, encryptedStr, charLength = 10){
    let decryptedStr = '';
    for (let i = 0; i < encryptedStr.length / charLength; i++) {
        decryptedStr += String.fromCharCode(key.indexOf(encryptedStr.slice(i * charLength, i * charLength + charLength)) / charLength);
    };
    return decryptedStr;
}

module.exports = {randStr, createKey, encrypt, decrypt};