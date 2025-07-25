exports.capitalizeFirstLetter = function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

exports.OTP = function (user) {
    var secureCode = Math.floor(100000 + Math.random() * 900000);
    secureCode = secureCode.toString().substring(0, 4);
    var message = '';
    secureCode = parseInt(secureCode);
    return secureCode;
};

exports.getPercentage = function (partialValue, totalValue) {
    return ((100 * partialValue) / totalValue).toFixed();
}

exports.getPersonalStatus = function (partialValue, totalValue) {
    return ((100 * partialValue) / totalValue).toFixed();
}

exports.getCheckOrderStatus = function (orderObject) {
    console.log("orderObject>>>>", orderObject._id);
    let order_datetime = new Date(orderObject.order_date);
    let current_datetime = new Date();
    let order_day = order_datetime.getDate(); var order_month = order_datetime.getMonth() + 1;
    console.log("order_datetime>>>>>", order_datetime);
    let current_day = current_datetime.getDate(); var current_month = current_datetime.getMonth() + 1;
    if (order_day < 10) {
        order_day = '0' + order_day;
    }
    if (order_month < 10) {
        order_month = '0' + order_month;
    }
    if (current_day < 10) {
        current_day = '0' + current_day;
    }
    if (current_month < 10) {
        current_month = '0' + current_month;
    }
    let formatted_order_date = order_datetime.getFullYear() + "-" + order_month + "-" + order_day + "T" + orderObject.order_time.slice(0, 5) + ":00";
    let formatted_current_date = current_datetime;
    console.log("formatted_order_date>>>>>", formatted_order_date);
    console.log("formatted_current_date>>>>>", formatted_current_date);
    var date1 = new Date(formatted_order_date).getTime();
    var date2 = new Date(formatted_current_date).getTime();
    console.log("date1>>>>>", date1);
    console.log("date2>>>>>", date2);
    if (orderObject.order_status == 0) {

    }
    return true;
}

exports.getOrderComplete = function (orderObject) {
    var flag = false;
    let order_datetime = new Date(orderObject.order_date);
    let current_datetime = new Date();
    let order_day = order_datetime.getDate(); var order_month = order_datetime.getMonth() + 1;

    if (order_day < 10) { order_day = '0' + order_day }
    if (order_month < 10) { order_month = '0' + order_month }

    let formatted_order_date = order_datetime.getFullYear() + "-" + order_month + "-" + order_day + "T" + orderObject.job_start_time.slice(0, 5) + ":00";

    let formatted_current_date = current_datetime;

    var date1 = new Date(formatted_order_date).getTime();
    var date2 = new Date(formatted_current_date).getTime();
    // var addingHoursInOrderDateTime = date1+ 1*3600*1000; /* 1 hours in ms */
    var addingHoursInOrderDateTime = date1 + 24 * 3600 * 1000; /* 24 hours in ms */
    // console.log("date1",date1)
    // console.log("date2",date2)
    // console.log("addingHoursInOrderDateTime",addingHoursInOrderDateTime)
    if (date2 > addingHoursInOrderDateTime) {
        flag = true;
    } else {
        flag = false;
    }
    // console.log("flag>>>>Complete"+orderObject._id+'-'+orderObject.order_date,flag)
    return flag;
}

exports.getOrderExpire = function (orderObject) {
    var flag = false;
    // let order_datetime = new Date(orderObject.createdAt);
    let order_datetime = new Date(orderObject.order_date);
    let current_datetime = new Date();
    let order_day = order_datetime.getDate(); var order_month = order_datetime.getMonth() + 1;

    if (order_day < 10) { order_day = '0' + order_day }
    if (order_month < 10) { order_month = '0' + order_month }

    // let formatted_order_date = order_datetime.getFullYear()+ "-" + order_month + "-" + order_day + "T" +orderObject.order_time.slice(0, 5) +":00";
    let formatted_order_date = order_datetime;
    let formatted_current_date = current_datetime;

    var date1 = new Date(formatted_order_date).getTime();
    var date2 = new Date(formatted_current_date).getTime();
    // var addingHoursInOrderDateTime = date1+ 1*3600*1000; /* 1 hours in ms */
    var addingHoursInOrderDateTime = date1 + 12 * 3600 * 1000; /* 15 hours in ms */

    if (date2 > addingHoursInOrderDateTime) {
        flag = true;
    } else {
        flag = false;
    }
    // console.log("flag>>>>Expire"+orderObject._id+'-'+orderObject.order_date,flag)
    return flag;
}

exports.getCalcalutionOfChefAndHelper = function (totalTime) {
    var value = { chef: 0, helper: 0 };
    let totalHours = 0;
    totalHours = totalTime / 60;
    total8HoursCal = totalHours / 8;
    if (totalHours > 1) {
        value.chef = 1;
        value.helper = Math.ceil(total8HoursCal) - 1;
    } else {
        value.chef = 1;
        value.helper = 0;
    }
    return value;
}

exports.getDistanceFromLatLonInKm = function (lat1, lon1, lat2, lon2) {
    console.log(lat1, lon1, lat2, lon2)
    function deg2rad(deg) {
        return deg * (Math.PI / 180)
    }
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);  // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
};

const Order = require('../models/order'); // adjust path as needed
const Decoration = require('../models/decoration');
const { default: mongoose } = require('mongoose');

exports.updateDecorationPopularity = async () => {
    try {
        await Decoration.updateMany({}, { popularity_score: -100000 })
        // Step 1: Fetch all completed orders (order_status = 3)
        const completedOrders = await Order.find({ order_status: { $in: [1, 2, 3, 5, 6] } });

        const usageMap = {};
        try {

            // Step 2: Count how many times each decoration ID appears in orders
            completedOrders.forEach(order => {
                if (Array.isArray(order.items)) {
                    order.items.forEach(itemId => {
                        if (mongoose.Types.ObjectId.isValid(itemId)) {
                            const idStr = String(itemId);
                            usageMap[idStr] = (usageMap[idStr] || 0) + 1;
                        } else if (itemId.item_id && mongoose.Types.ObjectId.isValid(itemId.item_id)) {
                            const idStr = String(itemId.item_id);
                            usageMap[idStr] = (usageMap[idStr] || 0) + 1;
                        } else {
                            console.error(`Invalid MongoDB ObjectId: ${JSON.stringify(itemId)} in order: ${order._id}`);
                        }
                    });
                }
            });

        } catch (error) {
        console.log('Error:', error);
        }
        // Step 3: Calculate popularity score and update each decoration
        const decorationIds = Object.keys(usageMap);

        const now = new Date();

        for (const id of decorationIds) {
            try {
                
                console.log(JSON.stringify(id,null,4))
                const decoration = await Decoration.findById(id);
                if (!decoration || !decoration.createdAt) {
                    console.log(`Decoration not found: ${id}`);
                    continue;
                }
                
                
                const createdAt = new Date(decoration.createdAt);
            const diffInTime = now.getTime() - createdAt.getTime();
            const ageInDays = Math.floor(diffInTime / (1000 * 60 * 60 * 24));
            
            const orderCount = usageMap[id];
            const score = (500 + (orderCount * 300)) - (ageInDays * 5);
            const popularity_score = score // Ensure no negative scores
            console.log(`${id}: orderCount=${orderCount}, ageInDays=${ageInDays}, score=${score}, popularity_score=${popularity_score}`)
            await Decoration.findByIdAndUpdate(id, { popularity_score });
        } catch (error) {
        console.error(`Error updating decoration ${id}: ${error.message}`);
        }
        }

        console.log('? Popularity scores updated without date libraries.');
    } catch (err) {
        console.error('? Error updating popularity scores:', err);
    }
};

// 2100 - 500 - 2245 
