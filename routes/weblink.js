const express = require("express");
const router = express.Router();
const WebLink = require("../models/weblink-images");
const FolderModel = require ("../models/folder")

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

router.get("/getSubFolders", async (req, res) => {
  try {
    const { folderName } = req.query;

    if (!folderName) {
      return res.status(400).json({ message: "folderName is required" });
    }

    const folder = await FolderModel.findOne({ folderName }).lean();

    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    res.status(200).json({
      folder,
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});


module.exports = router;
