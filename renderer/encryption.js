function randStr(length) {
    let result = '';
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < length; i++){
       result += characters.charAt(Math.floor(Math.random() * characters.length));
    };
    return result;
};

function createKey(charLength = 10){
    let key = '';
    for (let i = 0; i < 10; i++){
        let str = randStr(charLength);
        while (key.includes(str)) { //if the random string already exists, generate new random string
            str = randStr(charLength);
        };
        key += str;
    };
    return key;
};

function encrypt(key, plainStr, charLength = 10){
    let encryptedStr = '';
    for (const char of plainStr){
        let encryptedCode = '';
        for (const num of char.charCodeAt(0).toString()) { //for every individual number of the character code
            encryptedCode += key.slice(parseInt(num) * charLength, parseInt(num) * charLength + charLength); //add the section of the key that corresponds to that number
        };
        while (encryptedCode.length < 5 * charLength) encryptedCode = key.slice(0, charLength) + encryptedCode; //if the length of the code is less than max char code of 5, prepend encrypted zeroes
        encryptedStr += encryptedCode;
    }; 
    return encryptedStr;
};

function decrypt(key, encryptedStr, charLength = 10){
    let decryptedStr = '';
    for (let i = 0; i < encryptedStr.length / charLength / 5; i++) {
        const char = encryptedStr.slice( i * charLength * 5, i * charLength * 5 + charLength * 5); //get every letter
        let num = '';
        for (let j = 0; j < 5; j++) {
            num += (key.indexOf(char.slice(j * charLength, j * charLength + charLength)) / 10); //assemble the character code
        };
        decryptedStr += String.fromCharCode(num);
    };
    return decryptedStr;
};

module.exports = { randStr, createKey, encrypt, decrypt };