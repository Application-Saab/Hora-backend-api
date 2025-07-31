exports.isBase64Image = function (str) {
    return  typeof str === "string" && /^data:image\/[a-zA-Z]+;base64,/.test(str);
}