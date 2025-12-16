const jwt = require('jsonwebtoken');
const Response = require('./response');

const passportAuth = (req, res, next) => {
    const token = req.headers['authorization'];

    if (token) {
        jwt.verify(token, 'secret', (err, decoded) => {
            if (err) {
                const response = Response.createResponse(
                    Response.RequestStatus.Fail,
                    "Failed to authenticate token."
                );
                return res.status(401).json(response);
            } else {
                req.user = decoded;
                next();
            }
        });
    } else {
        const response = Response.createResponse(
            Response.RequestStatus.Fail,
            "No token provided."
        );
        return res.status(403).json(response);
    }
};

const signToken = (user) => {
    return jwt.sign(
        {
            _id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
        },
        'secret',
        { expiresIn: '365d' }
    );
};

module.exports = {
    passportAuth,
    signToken
};
