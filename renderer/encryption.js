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

const morseKey = ['-----', '.----', '..---', '...--', '....-', '.....', '-....', '--...', '---..', '----.'];
const patterns = {
    '--': 'A',
    '..': 'C',
    '-.': 'G',
    '.-': 'T'
}

function standardEncrypt(plainStr){
    let encryptedStr = '';
    for (const char of plainStr){ //loop through each letter of the string
        let morseCharCode = [];
        for (const num of char.charCodeAt(0).toString()) { //convert each number of the charcode into morse
            morseCharCode.push(morseKey[num]);
        }
        morseCharCode.forEach((code, index) => { //replace each morse number with a 3 digit pattern
            let letter = '';
            for (let i = 0; i <= 3; i += 2){
                letter += patterns[code[i] + code[i + 1]];
            }
            letter += patterns[code[3] + code[4]];
            morseCharCode[index] = letter;
        });
        const rnaPattern = ['A', 'C', 'G'];
        while (morseCharCode.length < 5) { //insert random 3 digit patterns including "U" at random positions until char code length limit of 5 is reached
            let randStr = rnaPattern[Math.floor(Math.random() * 3)] + rnaPattern[Math.floor(Math.random() * 3)];
            const randPos = Math.floor(Math.random() * 4);
            randStr = randStr.slice(0, randPos) + "U" + randStr.slice(randPos);
            
            morseCharCode.splice(Math.floor(Math.random() * 5), 0, randStr);
        }
        encryptedStr += morseCharCode.join('');
    }
    return encryptedStr;
}

function standardDecrypt(encryptedStr){
    let plainStr = '';
    for (let i = 0, len = encryptedStr.length; i < len; i += 15){ //loop each letter (15 encrypted characters)
        const encryptedLetter = encryptedStr.slice(i, i + 15);
        let letter = '';
        for (let j = 0; j < 15; j += 3){ //loop each number in the character code (3 encrypted characters)
            let num = encryptedLetter.slice(j, j + 3).split('');
            if (num.includes('U')) continue;
            num.forEach((digit, index) => { //convert pattern into morse
                for (const pattern in patterns) {
                    if (patterns[pattern] === digit) {
                        num[index] = index === 2 ? pattern[1] : pattern
                    }
                }
            });
            num = num.join('');
            morseKey.forEach((morseNum, index) => { //convert morse to number
                if (num === morseNum) {
                    num = index;
                    return;
                }
            });
            letter += num;
        }
        plainStr += String.fromCharCode(letter);
    }
    return plainStr;
}

module.exports = { randStr, createKey, encrypt, decrypt, standardEncrypt, standardDecrypt };