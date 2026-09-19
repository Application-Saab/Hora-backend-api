const jwt = require("jsonwebtoken");
const Response = require("./response");

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

const ACCESS_TOKEN_EXPIRES_IN = "15d";
const REFRESH_TOKEN_EXPIRES_IN = "90d";

const signToken = (user) => {
    return jwt.sign(
        {
            _id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
        },
        ACCESS_TOKEN_SECRET,
        {
            expiresIn: ACCESS_TOKEN_EXPIRES_IN,
        }
    );
};

const signRefreshToken = (user) => {
    return jwt.sign(
        {
            _id: user._id,
        },
        REFRESH_TOKEN_SECRET,
        {
            expiresIn: REFRESH_TOKEN_EXPIRES_IN,
        }
    );
};

const passportAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        const response = Response.createResponse(
            Response.RequestStatus.Fail,
            "No token provided."
        );

        return res.status(401).json(response);
    }

    const token = authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : authHeader;

    jwt.verify(token, ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            const response = Response.createResponse(
                Response.RequestStatus.Fail,
                "Failed to authenticate token."
            );

            return res.status(401).json(response);
        }

        req.user = decoded;
        next();
    });
};

const verifyRefreshToken = (refreshToken) => {
    return jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
};

module.exports = {
    passportAuth,
    signToken,
    signRefreshToken,
    verifyRefreshToken,
};