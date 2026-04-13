const PopularitySetting = require("../models/PopularitySetting");
exports.capitalizeFirstLetter = function (string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
};
exports.CustomResponse = (res, status, error, message, data = null) =>
  res.status(status).json({ error, status, message, data });

exports.OTP = function (user) {
  var secureCode = Math.floor(100000 + Math.random() * 900000);
  secureCode = secureCode.toString().substring(0, 4);
  var message = "";
  secureCode = parseInt(secureCode);
  return secureCode;
};

exports.getPercentage = function (partialValue, totalValue) {
  return ((100 * partialValue) / totalValue).toFixed();
};

exports.getPersonalStatus = function (partialValue, totalValue) {
  return ((100 * partialValue) / totalValue).toFixed();
};

exports.getCheckOrderStatus = function (orderObject) {
  console.log("orderObject>>>>", orderObject._id);
  let order_datetime = new Date(orderObject.order_date);
  let current_datetime = new Date();
  let order_day = order_datetime.getDate();
  var order_month = order_datetime.getMonth() + 1;
  console.log("order_datetime>>>>>", order_datetime);
  let current_day = current_datetime.getDate();
  var current_month = current_datetime.getMonth() + 1;
  if (order_day < 10) {
    order_day = "0" + order_day;
  }
  if (order_month < 10) {
    order_month = "0" + order_month;
  }
  if (current_day < 10) {
    current_day = "0" + current_day;
  }
  if (current_month < 10) {
    current_month = "0" + current_month;
  }
  let formatted_order_date =
    order_datetime.getFullYear() +
    "-" +
    order_month +
    "-" +
    order_day +
    "T" +
    orderObject.order_time.slice(0, 5) +
    ":00";
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
};

exports.getOrderComplete = function (orderObject) {
  var flag = false;
  let order_datetime = new Date(orderObject.order_date);
  let current_datetime = new Date();
  let order_day = order_datetime.getDate();
  var order_month = order_datetime.getMonth() + 1;

  if (order_day < 10) {
    order_day = "0" + order_day;
  }
  if (order_month < 10) {
    order_month = "0" + order_month;
  }

  let formatted_order_date =
    order_datetime.getFullYear() +
    "-" +
    order_month +
    "-" +
    order_day +
    "T" +
    orderObject.job_start_time.slice(0, 5) +
    ":00";

  let formatted_current_date = current_datetime;

  var date1 = new Date(formatted_order_date).getTime();
  var date2 = new Date(formatted_current_date).getTime();
  var addingHoursInOrderDateTime =
    date1 + 24 * 3600 * 1000; /* 24 hours in ms */
  if (date2 > addingHoursInOrderDateTime) {
    flag = true;
  } else {
    flag = false;
  }
  return flag;
};

exports.getOrderExpire = function (orderObject) {
  let flag = false;
  const current_datetime = new Date();
  const order_date = new Date(orderObject.order_date); // order ka date

  try {
    if (orderObject.order_time && orderObject.order_time.includes("-")) {
      // order_time example: "7:00 AM - 10:00 AM"
      const timeRange = orderObject.order_time.split("-").map((t) => t.trim());
      const endTimeStr = timeRange[1]; // end time

      // Parse end time
      let [time, meridian] = endTimeStr.split(" ");
      let [hours, minutes] = time.split(":").map(Number);

      if (meridian.toUpperCase() === "PM" && hours !== 12) {
        hours += 12;
      } else if (meridian.toUpperCase() === "AM" && hours === 12) {
        hours = 0;
      }

      // Set order end datetime
      let orderEndDateTime = new Date(order_date);
      orderEndDateTime.setHours(hours, minutes, 0, 0);

      // Add 3 hours
      orderEndDateTime = new Date(orderEndDateTime.getTime() + 3 * 3600 * 1000);

      // Compare current datetime
      if (current_datetime >= orderEndDateTime) {
        flag = true;
      }
    } else {
      // Fallback: agar order_time missing ya invalid ho to purana 12 hours logic
      const order_datetime = new Date(orderObject.order_date);
      const addingHoursInOrderDateTime =
        order_datetime.getTime() + 12 * 3600 * 1000; // 12 hours
      if (current_datetime.getTime() > addingHoursInOrderDateTime) {
        flag = true;
      }
    }
  } catch (err) {
    // Agar koi parsing error ho to fallback use karenge
    const order_datetime = new Date(orderObject.order_date);
    const addingHoursInOrderDateTime =
      order_datetime.getTime() + 12 * 3600 * 1000; // 12 hours
    if (current_datetime.getTime() > addingHoursInOrderDateTime) {
      flag = true;
    }
  }

  return flag;
};

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
};

exports.getDistanceFromLatLonInKm = function (lat1, lon1, lat2, lon2) {
  console.log(lat1, lon1, lat2, lon2);
  function deg2rad(deg) {
    return deg * (Math.PI / 180);
  }
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2 - lat1); // deg2rad below
  var dLon = deg2rad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c; // Distance in km
  return d;
};

const Order = require("../models/order"); // adjust path as needed
const Decoration = require("../models/decoration");
const { default: mongoose } = require("mongoose");

let popularityJobRunning = false;

exports.updateDecorationPopularity = async () => {

  if (popularityJobRunning) {
    console.warn("Popularity job already running, skipping...");
    return;
  }

  popularityJobRunning = true;
  console.time("PopularityJob");

  try {
    const now = new Date();

    // Get last run time
    let setting = await PopularitySetting.findOne({ key: "popularityLastRun" });

    let lastRun = setting?.value;

    // first run case (fallback)
    if (!lastRun) {
      lastRun = new Date("2026-03-15");
    } else {
      lastRun = new Date(lastRun);
    }

    const daysPassed = Math.floor(
      (now.getTime() - lastRun.getTime()) / 86400000
    );

    const decorations = await Decoration.find(
      {},
      { _id: 1, createdAt: 1, popularity_score: 1 }
    ).lean();

    const orders = await Order.find(
      {
        order_status: { $in: [1, 2, 3, 5, 6] },
        createdAt: { $gte: lastRun }
      },
      { items: 1, createdAt: 1 }
    ).lean();

    const usageMap = {};
    const totalOrdersMap = {};

    const extractDecorationId = (item) => {
      if (!item) return null;

      if (mongoose.Types.ObjectId.isValid(item))
        return String(item);

      if (item.item_id && mongoose.Types.ObjectId.isValid(item.item_id))
        return String(item.item_id);

      if (item._id && mongoose.Types.ObjectId.isValid(item._id))
        return String(item._id);
      return null;
    };

    // Count orders
    for (const order of orders) {
      if (!Array.isArray(order.items)) continue;
      for (const item of order.items) {
        const id = extractDecorationId(item);
        if (!id) continue;
        usageMap[id] = (usageMap[id] || 0) + 1;
      }
    }

    // Total orders for new designs only
    const allOrders = await Order.find(
      { order_status: { $in: [1, 2, 3, 5, 6] } },
      { items: 1 }
    ).lean();

    for (const order of allOrders) {
      if (!Array.isArray(order.items)) continue;
      for (const item of order.items) {
        const id = extractDecorationId(item);
        if (!id) continue;
        totalOrdersMap[id] = (totalOrdersMap[id] || 0) + 1;
      }
    }

    const BATCH_SIZE = 50;
    for (let i = 0; i < decorations.length; i += BATCH_SIZE) {

      const batch = decorations.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (decoration) => {
          try {
            const id = String(decoration._id);
            const createdAt = new Date(decoration.createdAt);

            const daysOfCreated = Math.floor(
              (now.getTime() - createdAt.getTime()) / 86400000
            );

            const newOrders = usageMap[id] || 0;
            const totalOrders = totalOrdersMap[id] || 0;
            
            let score;
            // NEW DESIGN
            if (decoration.popularity_score == null) {
              score =
                5000 +
                300 * totalOrders -
                15 * daysOfCreated;
            }

            // EXISTING DESIGN
            else {
              score =
                decoration.popularity_score +
                300 * newOrders -
                15 * daysPassed;
            }
            await Decoration.updateOne(
              { _id: id },
              { $set: { popularity_score: score } }
            );
          } catch (err) {
            console.error(
              `Popularity update failed for ${decoration._id}`,
              err.message
            );
          }
        })
      );
    }

    // Update last run time
    await PopularitySetting.updateOne(
      { key: "popularityLastRun" },
      { $set: { value: now } },
      { upsert: true }
    );
    console.log("Decoration popularity updated successfully");
  } catch (err) {
    console.error("Popularity job failed", err);
  } finally {
    popularityJobRunning = false;
    console.timeEnd("PopularityJob");
  }
};