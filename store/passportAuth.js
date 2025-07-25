var jwt = require('jsonwebtoken');
var Response = require('./response');

exports.passportAuth = function(req, res, next) {
    var token = req.headers['authorization'];
    if (token) {
        jwt.verify(token, 'secret', function(err, decoded) {
            if (err) {
                var response = Response.createResponse(Response.RequestStatus.Fail, "Failed to authenticate token.");
                return res.json(401, response);
            } else {
                req.user = decoded;
                next();
            }
        });
    } else {
        var response = Response.createResponse(Response.RequestStatus.Fail, "No token provided.");
        return res.status(403).json(response);
    }
};

exports.signToken = function(user) {
    const token = jwt.sign({
            _id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
        },
        'secret', {
            expiresIn: "365d",
        }
    );
    return token;
};