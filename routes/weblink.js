const express = require("express");
const router = express.Router();
const WebLink = require("../models/weblink-images");
const Order = require("../models/order");
const Folder = require("../models/folder");
const User = require("../models/user");

router.put("/assign-to-subfolder", async (req, res) => {
  try {
    const { subFolderId, addImageIds = [], removeImageIds = [] } = req.body;

    if (!subFolderId) {
      return res.status(400).json({ message: "subFolderId is required" });
    }

    if (addImageIds.length > 0) {
      await WebLink.updateMany(
        { _id: { $in: addImageIds } },
        { $addToSet: { folderIds: subFolderId } }
      );
    }

    if (removeImageIds.length > 0) {
      await WebLink.updateMany(
        { _id: { $in: removeImageIds } },
        { $pull: { folderIds: subFolderId } }
      );
    }

    return res.status(200).json({
      message: "Subfolder updated successfully",
      added: addImageIds.length,
      removed: removeImageIds.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/toggle-like", async (req, res) => {
  try {
    const { imageIds = [], userId } = req.body;

    if (!userId || imageIds.length === 0) {
      return res.status(400).json({
        message: "userId and imageIds are required",
      });
    }

    const updatedImages = [];

    for (const imageId of imageIds) {
      const image = await WebLink.findById(imageId);

      if (!image) continue;

      const alreadyLiked = image.likedBy.includes(userId);

      if (alreadyLiked) {
        await WebLink.updateOne(
          { _id: imageId },
          { $pull: { likedBy: userId } }
        );
      } else {
        await WebLink.updateOne(
          { _id: imageId },
          { $addToSet: { likedBy: userId } }
        );
      }

      updatedImages.push({
        imageId,
        liked: !alreadyLiked,
      });
    }

    return res.status(200).json({
      message: "Like status updated",
      data: updatedImages,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// router.get("/capsule-tracking", async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;
//     const skip = (page - 1) * limit;
//     const search = req.query.search;

//     const query = {
//       type: 8,
//       orderWebLink: {
//         $exists: true,
//         $ne: "",
//         $nin: [null, " "],
//       }
//     };

//     if (search) {
//       query.order_id = Number(search);
//     }

//     const orders = await Order.find(query)
//       .select("order_id orderWebLink imageUploadCounts.driveProvidedAt")
//       .sort({
//         "imageUploadCounts.driveProvidedAt": -1,
//         createdAt: -1
//       })
//       .skip(skip)
//       .limit(limit)
//       .lean();

//     const totalOrders = await Order.countDocuments(query);

//     const ordersWithCount = await Promise.all(
//       orders.map(async (order) => {

//         const folder = await Folder.findOne({ orderId: order.order_id })
//           .select("_id subFolders viewedBy clickCount")
//           .lean();

//         let imageCount = 0;
//         let videoCount = 0;
//         let totalLikes = 0;
//         let totalDownloads = 0;
//         let totalShares = 0;
//         let faceRecognitionCount = 0;
//         let otherSubFoldersCount = 0;

//         let totalViews = 0;
//         let totalClicks = 0;

//         if (folder) {

//           totalViews = folder.viewedBy?.length || 0;
//           totalClicks = folder.clickCount || 0;

//           // Subfolder counts
//           if (folder.subFolders?.length) {
//             faceRecognitionCount = folder.subFolders.filter(
//               (sub) => sub.type === "my_photos"
//             ).length;

//             otherSubFoldersCount = folder.subFolders.filter(
//               (sub) => sub.type !== "my_photos"
//             ).length;
//           }

//           // Media data
//           const [imgs, vids, mediaData] = await Promise.all([
//             WebLink.countDocuments({
//               mainFolderId: folder._id,
//               type: "image"
//             }),
//             WebLink.countDocuments({
//               mainFolderId: folder._id,
//               type: "video"
//             }),
//             WebLink.find({ mainFolderId: folder._id })
//               .select("likedBy downloadCount shareCount")
//               .lean()
//           ]);

//           imageCount = imgs;
//           videoCount = vids;

//           mediaData.forEach((item) => {
//             totalLikes += item.likedBy?.length || 0;
//             totalDownloads += item.downloadCount || 0;
//             totalShares += item.shareCount || 0;
//           });
//         }

//         return {
//           ...order,
//           mainFolderId: folder?._id || null,
//           counts: {
//             imageCount,
//             videoCount,
//             totalMedia: imageCount + videoCount,
//             totalLikes,
//             totalDownloads,
//             totalShares,
//             faceRecognitionCount,
//             otherSubFoldersCount,
//             totalViews,
//             totalClicks
//           }
//         };
//       })
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Data fetched successfully",
//       pagination: {
//         totalItems: totalOrders,
//         totalPages: Math.ceil(totalOrders / limit),
//         currentPage: page,
//         pageSize: ordersWithCount.length
//       },
//       data: ordersWithCount
//     });

//   } catch (error) {
//     console.error("Error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error"
//     });
//   }
// });


router.get("/capsule-tracking", async (req, res) => {
  try {

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search;

    const matchQuery = {
      type: 8,
      orderWebLink: {
        $exists: true,
        $nin: ["", " ", null]
      }
    };

    if (search) {
      matchQuery.order_id = Number(search);
    }

    const [orders, totalOrders] = await Promise.all([

      Order.aggregate([

        {
          $match: matchQuery
        },

        {
          $sort: {
            "imageUploadCounts.driveProvidedAt": -1,
            createdAt: -1
          }
        },

        {
          $skip: skip
        },

        {
          $limit: limit
        },

        // Folder Lookup
{
  $addFields: {
    orderIdString: {
      $toString: "$order_id"
    }
  }
},

{
  $lookup: {
    from: "folders",
    localField: "orderIdString",
    foreignField: "orderId",
    as: "folder"
  }
},

        {
          $unwind: {
            path: "$folder",
            preserveNullAndEmptyArrays: true
          }
        },

        // Weblinks Lookup
        {
          $lookup: {
            from: "weblinks",
            localField: "folder._id",
            foreignField: "mainFolderId",
            as: "media"
          }
        },

        {
          $addFields: {

            imageCount: {
              $size: {
                $filter: {
                  input: "$media",
                  as: "m",
                  cond: {
                    $eq: ["$$m.type", "image"]
                  }
                }
              }
            },

            videoCount: {
              $size: {
                $filter: {
                  input: "$media",
                  as: "m",
                  cond: {
                    $eq: ["$$m.type", "video"]
                  }
                }
              }
            },

            totalLikes: {
              $sum: {
                $map: {
                  input: "$media",
                  as: "m",
                  in: {
                    $size: {
                      $ifNull: ["$$m.likedBy", []]
                    }
                  }
                }
              }
            },

            totalDownloads: {
              $sum: "$media.downloadCount"
            },

            totalShares: {
              $sum: "$media.shareCount"
            },

            faceRecognitionCount: {
              $size: {
                $filter: {
                  input: {
                    $ifNull: ["$folder.subFolders", []]
                  },
                  as: "s",
                  cond: {
                    $eq: ["$$s.type", "my_photos"]
                  }
                }
              }
            },

            otherSubFoldersCount: {
              $size: {
                $filter: {
                  input: {
                    $ifNull: ["$folder.subFolders", []]
                  },
                  as: "s",
                  cond: {
                    $ne: ["$$s.type", "my_photos"]
                  }
                }
              }
            },

            totalViews: {
              $size: {
                $ifNull: ["$folder.viewedBy", []]
              }
            },

            totalClicks: {
              $ifNull: ["$folder.clickCount", 0]
            }
          }
        },

        {
          $project: {
            order_id: 1,
            orderWebLink: 1,
            imageUploadCounts: 1,

            mainFolderId: "$folder._id",

            counts: {
              imageCount: "$imageCount",
              videoCount: "$videoCount",
              totalMedia: {
                $add: ["$imageCount", "$videoCount"]
              },
              totalLikes: "$totalLikes",
              totalDownloads: "$totalDownloads",
              totalShares: "$totalShares",
              faceRecognitionCount: "$faceRecognitionCount",
              otherSubFoldersCount: "$otherSubFoldersCount",
              totalViews: "$totalViews",
              totalClicks: "$totalClicks"
            }
          }
        }

      ]),

      Order.countDocuments(matchQuery)

    ]);

    return res.status(200).json({
      success: true,
      message: "Data fetched successfully",

      pagination: {
        totalItems: totalOrders,
        totalPages: Math.ceil(totalOrders / limit),
        currentPage: page,
        pageSize: orders.length
      },

      data: orders
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });

  }
});

router.post("/track-activity/:mediaId", async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { action } = req.body;

    let updateQuery = {};
    if (action === "download") {
      updateQuery = { $inc: { downloadCount: 1 } };
    } else if (action === "share") {
      updateQuery = { $inc: { shareCount: 1 } };
    } else {
      return res.status(400).json({ message: "Invalid action" });
    }

    await WebLink.findByIdAndUpdate(mediaId, updateQuery);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Tracking Error:", error);
    res.status(500).json({ success: false });
  }
});

router.post("/track-gallery-view", async (req, res) => {
  try {
    const { userId, mainFolderId } = req.body;

    if (!userId || !mainFolderId) {
      return res.status(400).json({
        success: false,
        message: "userId and mainFolderId are required",
      });
    }

    const folder = await Folder.findById(mainFolderId);
    if (!folder) {
      return res.status(404).json({ success: false, message: "Invalid link" });
    }


    const updatedFolder = await Folder.findByIdAndUpdate(
      mainFolderId,
      {
        $addToSet: { viewedBy: userId },
      },
      { new: true }
    );

    return res.json({
      success: true,
      data: updatedFolder,
    });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/track-click', async (req, res) => {
  const { mainFolderId } = req.body;

  if (!mainFolderId) return res.status(400).send("mainFolderId is required");

  try {
    const stats = await Folder.findByIdAndUpdate(
      mainFolderId,
      { $inc: { clickCount: 1 } },
      { new: true },
    );

    res.status(200).json({
      success: true,
      currentDailyClicks: stats.clickCount,
    });
  } catch (error) {
    console.error("Tracking Error:", error);
    res.status(500).send("Server Error");
  }
});

// router.get("/capsule-users", async (req, res) => {
//   try {
//     let { page = 1, limit = 10, search } = req.query;

//     page = parseInt(page);
//     limit = parseInt(limit);
//     const skip = (page - 1) * limit;

//     const orderQuery = {
//       type: 8,
//       orderWebLink: {
//         $exists: true,
//         $ne: "",
//         $nin: [null, " "],
//       },
//     };

//     const pipeline = [
//       // -------------------------------
//       // ORDERS USERS
//       // -------------------------------
//       { $match: orderQuery },

//       {
//         $group: {
//           _id: "$fromId",
//           phone: { $first: "$phone_no" },
//           totalOrders: { $sum: 1 },
//         },
//       },

//       // -------------------------------
//       // MERGE GUEST USERS
//       // -------------------------------
//       {
//         $unionWith: {
//           coll: "folders",
//           pipeline: [
//             {
//               $project: {
//                 viewedBy: {
//                   $cond: [
//                     { $isArray: "$viewedBy" },
//                     "$viewedBy",
//                     [],
//                   ],
//                 },
//               },
//             },
//             { $unwind: "$viewedBy" },

//             {
//               $group: {
//                 _id: "$viewedBy",
//                 phone: { $first: null },
//                 totalOrders: { $sum: 0 },
//               },
//             },
//           ],
//         },
//       },

//       // -------------------------------
//       // REMOVE DUPLICATES
//       // -------------------------------
//       {
//         $group: {
//           _id: "$_id",
//           phone: { $first: "$phone" },
//           totalOrders: { $max: "$totalOrders" },
//         },
//       },

//       // -------------------------------
//       // USER LOOKUP
//       // -------------------------------
//       {
//         $addFields: {
//           userObjectId: {
//             $cond: [
//               { $eq: [{ $type: "$_id" }, "objectId"] },
//               "$_id",
//               { $toObjectId: "$_id" },
//             ],
//           },
//         },
//       },

//       {
//         $lookup: {
//           from: "users",
//           localField: "userObjectId",
//           foreignField: "_id",
//           as: "userData",
//         },
//       },
//       {
//         $unwind: {
//           path: "$userData",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       // -------------------------------
//       // UPLOADS
//       // -------------------------------
//       {
//         $lookup: {
//           from: "weblinks",
//           let: { userId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: [
//                     "$orderById",
//                     { $toString: "$$userId" },
//                   ],
//                 },
//               },
//             },
//           ],
//           as: "uploadData",
//         },
//       },
//       {
//         $addFields: {
//           totalUploads: { $size: "$uploadData" },
//         },
//       },
//       {
//         $addFields: {
//           totalUploads: { $size: "$uploadData" },
//         },
//       },

//       // -------------------------------
//       // LIKES (FIXED)
//       // -------------------------------
//       {
//         $lookup: {
//           from: "weblinks",
//           let: { userId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $in: [
//                     "$$userId",
//                     {
//                       $cond: [
//                         { $isArray: "$likedBy" },
//                         "$likedBy",
//                         [],
//                       ],
//                     },
//                   ],
//                 },
//               },
//             },
//             { $count: "totalLikes" },
//           ],
//           as: "likesData",
//         },
//       },
//       {
//         $addFields: {
//           totalLikes: {
//             $ifNull: [
//               { $arrayElemAt: ["$likesData.totalLikes", 0] },
//               0,
//             ],
//           },
//         },
//       },
//       {
//         $addFields: {
//           totalLikes: { $size: "$likesData" },
//         },
//       },

//       // -------------------------------
//       // GUEST CAPSULE COUNT (FIXED ERROR)
//       // -------------------------------
//       {
//         $lookup: {
//           from: "folders",
//           let: { userId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $in: [
//                     "$$userId",
//                     {
//                       $cond: [
//                         { $isArray: "$viewedBy" },
//                         "$viewedBy",
//                         [],
//                       ],
//                     },
//                   ],
//                 },
//               },
//             },
//             { $count: "guestCapsulesCount" },
//           ],
//           as: "guestData",
//         },
//       },

//       {
//         $addFields: {
//           guestCapsulesCount: {
//             $ifNull: [
//               { $arrayElemAt: ["$guestData.guestCapsulesCount", 0] },
//               0,
//             ],
//           },
//         },
//       },

//       // -------------------------------
//       // FINAL PROJECT
//       // -------------------------------
//       {
//         $project: {
//           _id: 0,
//           userId: "$_id",

//           phone: {
//             $cond: [
//               { $ne: ["$phone", null] },
//               "$phone",
//               "$userData.phone",
//             ],
//           },

//           totalOrders: 1,
//           fromCapsule: {
//             $ifNull: ["$userData.fromCapsule", false],
//           },

//           totalUploads: 1,
//           totalLikes: 1,
//           guestCapsulesCount: 1,
//         },
//       },

//       // -------------------------------
//       // SEARCH (AFTER MERGE)
//       // -------------------------------
//       ...(search
//         ? [
//           {
//             $match: {
//               phone: { $regex: search, $options: "i" },
//             },
//           },
//         ]
//         : []),

//       { $sort: { totalOrders: -1 } },
//     ];

//     // -------------------------------
//     // TOTAL COUNT
//     // -------------------------------
//     const totalResult = await Order.aggregate([
//       ...pipeline,
//       { $count: "total" },
//     ]);

//     const total = totalResult[0]?.total || 0;

//     // -------------------------------
//     //  PAGINATED DATA
//     // -------------------------------
//     const users = await Order.aggregate([
//       ...pipeline,
//       { $skip: skip },
//       { $limit: limit },
//     ]);

//     return res.status(200).json({
//       success: true,
//       message: "User data fetched successfully",
//       data: users,
//       pagination: {
//         total,
//         page,
//         limit,
//         totalPages: Math.ceil(total / limit),
//       },
//     });
//   } catch (error) {
//     console.error("Error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//     });
//   }
// });


router.get("/capsule-users", async (req, res) => {
  try {

    let { page = 1, limit = 10, search = "" } = req.query;

    page = Number(page);
    limit = Number(limit);

    const skip = (page - 1) * limit;

    // =====================================
    // HOST USERS
    // =====================================

    const hostUsers = await Order.aggregate([

      {
        $match: {
          type: 8,
          orderWebLink: {
            $exists: true,
            $nin: ["", " ", null]
          }
        }
      },

      {
        $group: {

          _id: {
            $toString: "$fromId"
          },

          phone: {
            $first: "$phone_no"
          },

          totalOrders: {
            $sum: 1
          },

          userType: {
            $first: "host"
          }

        }
      }

    ]);

    // =====================================
    // GUEST USERS
    // =====================================

    const guestUsers = await Folder.aggregate([

      {
        $match: {
          viewedBy: {
            $exists: true,
            $ne: []
          }
        }
      },

      {
        $unwind: "$viewedBy"
      },

      {
        $group: {

          _id: {
            $toString: "$viewedBy"
          },

          totalOrders: {
            $first: 0
          },

          userType: {
            $first: "guest"
          }

        }
      }

    ]);

    // =====================================
    // MERGE UNIQUE USERS
    // =====================================

const userMap = new Map();

[...hostUsers, ...guestUsers].forEach((user) => {

  const id = user._id.toString();

  if (userMap.has(id)) {

    const existing = userMap.get(id);

    existing.totalOrders = Math.max(
      existing.totalOrders,
      user.totalOrders
    );

  } else {

    userMap.set(id, user);

  }

});

    let users = Array.from(userMap.values());

    // =====================================
    // GET USER DATA
    // =====================================

    const userIds = users.map((u) => u._id);

    const [

      uploadCounts,
      likeCounts,
      guestCapsuleCounts,
      userData

    ] = await Promise.all([

      // =====================================
      // UPLOADS
      // =====================================

      WebLink.aggregate([

        {
          $match: {
            orderById: {
              $in: userIds
            }
          }
        },

        {
          $group: {
            _id: "$orderById",
            totalUploads: {
              $sum: 1
            }
          }
        }

      ]),

      // =====================================
      // LIKES
      // =====================================

      WebLink.aggregate([

        {
          $unwind: "$likedBy"
        },

        {
          $match: {
            likedBy: {
              $in: userIds
            }
          }
        },

        {
          $group: {

            _id: {
              $toString: "$likedBy"
            },

            totalLikes: {
              $sum: 1
            }

          }
        }

      ]),

      // =====================================
      // GUEST CAPSULES
      // =====================================

      Folder.aggregate([

        {
          $unwind: "$viewedBy"
        },

        {
          $match: {
            viewedBy: {
              $in: userIds
            }
          }
        },

        {
          $group: {

            _id: {
              $toString: "$viewedBy"
            },

            guestCapsulesCount: {
              $sum: 1
            }

          }
        }

      ]),

      // =====================================
      // USER INFO
      // =====================================

      User.find({
        _id: {
          $in: userIds
        }
      })
        .select("phone fromCapsule")
        .lean()

    ]);

    // =====================================
    // MAPS
    // =====================================

    const uploadMap = {};
    const likeMap = {};
    const guestMap = {};
    const userDataMap = {};

    uploadCounts.forEach((u) => {
      uploadMap[u._id] = u.totalUploads;
    });

    likeCounts.forEach((u) => {
      likeMap[u._id] = u.totalLikes;
    });

    guestCapsuleCounts.forEach((u) => {
      guestMap[u._id] = u.guestCapsulesCount;
    });

    userData.forEach((u) => {
      userDataMap[u._id.toString()] = u;
    });

    // =====================================
    // FINAL USERS
    // =====================================

    let finalUsers = users.map((u) => {

      const userInfo =
        userDataMap[u._id] || {};

      return {

        userId: u._id,

        userType: u.userType,

        phone:
          u.phone ||
          userInfo.phone ||
          null,

        totalOrders:
          u.totalOrders || 0,

        totalUploads:
          uploadMap[u._id] || 0,

        totalLikes:
          likeMap[u._id] || 0,

        guestCapsulesCount:
          guestMap[u._id] || 0,

        fromCapsule:
          userInfo.fromCapsule || false

      };

    });

    // =====================================
    // SEARCH
    // =====================================

    if (search?.trim()) {

      finalUsers = finalUsers.filter((u) =>
        (u.phone || "")
          .toString()
          .includes(search.trim())
      );

    }

    // =====================================
    // SORT
    // =====================================

    finalUsers.sort(
      (a, b) => b.totalOrders - a.totalOrders
    );

    // =====================================
    // TOTAL
    // =====================================

    const total = finalUsers.length;

    // =====================================
    // PAGINATION
    // =====================================

    finalUsers = finalUsers.slice(
      skip,
      skip + limit
    );

    // =====================================
    // RESPONSE
    // =====================================

    return res.status(200).json({

      success: true,

      message: "User data fetched successfully",

      data: finalUsers,

      pagination: {

        total,

        page,

        limit,

        totalPages: Math.ceil(total / limit)

      }

    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({

      success: false,

      message: "Server error"

    });

  }
});


module.exports = router;