/**
 * Response object to sent to
 */
exports.RequestStatus = {
    Success: "success",
    Fail: "fail",
    NotRegistered: "error"
};
exports.createResponse = function (requestStatus, errorMessage, data, dataCount, limit) {
    return {
        status: requestStatus,
        message: errorMessage,
        data: data,
        datacount: dataCount,
        limit: limit
    };
};