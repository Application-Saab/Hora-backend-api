require('dotenv').config();
const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
let https = require('https');
let http = require('http');
let fs = require('fs');
let path = require("path");
const imagePath=__dirname+ "/uploads/";
// Database Connection Start
const port = process.env.PORT;
mongoose.set("strictQuery", true);
mongoose.connect(`mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0.mx5lhta.mongodb.net/${process.env.MONGO_DATABASE}?retryWrites=true&w=majority`, { useNewUrlParser: true, useUnifiedTopology: true, autoIndex: false });
const database = mongoose.connection;
// Database Connection End

const app = express();

let server;
// Live Access
var privateKey = fs.readFileSync(path.join(__dirname, '.', 'privkey.pem'));;
var certificate = fs.readFileSync(path.join(__dirname, '.', 'cert.pem'));
server = https.createServer({
    key: privateKey,
    cert: certificate
}, app).listen(port, function() {
    console.log("Express server listening on port " + port);
});

// Local Access

// server = http.createServer(app).listen(port, function () {
//     console.log("Express server listening on port " + port);
// });

database.on('error', (error) => {
    console.log(error)
})

database.once('connected', () => {
    console.log('Database Connected data.js');
})

const IngredientModel = require('./models/ingredient');
let data1 = require('./data/Ingredient');
const request = require("request");
var download = function(uri, filename, callback){
    request.head(uri, function(err, res, body){
      console.log('content-type:', res.headers['content-type']);
      console.log('content-length:', res.headers['content-length']);
      request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
    });
    return filename;
};
setTimeout(() => {
    myData()
}, 1000);
function myData() { 
    for (let i = 0; i < data1.length; i++) {
        const replacePath=data1[i].Image.replace(/[^a-zA-Z0-9]/g,'_');
        const ingredient = new IngredientModel({
            name:data1[i].Ingredient,
            image:replacePath+'.png',
            categoryId:getType(data1[i].Type),
        })
        const dataToSave = ingredient.save();
       download(data1[i].Image, `${imagePath}`+`${replacePath}`+'.png', function(res,err){
        console.log('done',i);
    });
    };
} 

function getType(data) {
    var value="63e8dc59008d0107a3ded854";
    // if(data == 'Fruits & Vegetables'){
    //     value=1;
    // }else if(data == 'Masalas & Spices'){
    //     value=2;
    // }else if(data == 'General Items'){
    //     value=3;
    // }else if(data == 'Spreads & Sauces'){
    //     value=4;
    // }else if(data == 'Dairy Items'){
    //     value=5;
    // }else if(data == 'Wines & Spirits'){
    //     value=6;
    // }
    return value;
}
