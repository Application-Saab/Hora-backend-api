import jwt from 'jsonwebtoken';
import Response from './response.js';

export const passportAuth = (req, res, next) => {
    const token = req.headers['authorization'];
    if (token) {
        jwt.verify(token, 'secret', (err, decoded) => {
            if (err) {
                const response = Response.createResponse(Response.RequestStatus.Fail, "Failed to authenticate token.");
                return res.status(401).json(response); // safer than res.json(401, ...)
            } else {
                req.user = decoded;
                next();
            }
        });
    } else {
        const response = Response.createResponse(Response.RequestStatus.Fail, "No token provided.");
        return res.status(403).json(response);
    }
};
export const signToken = (user) => {
    const token = jwt.sign(
        {
            _id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
        },
        'secret',
        { expiresIn: "365d" }
    );
    return token;
};
