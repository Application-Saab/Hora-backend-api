const express = require("express");
const router = express.Router();
const MaterialList = require("../models/material-list");
const { CustomResponse } = require("../store/commonFunction");

// Create material
router.post("/createMaterial", async (req, res) => {
  try {
    if (!req.body.specs || !req.body.type || !req.body.materialName) {
      return CustomResponse(
        res,
        400,
        true,
        "specs, type and materialName are required",
      );
    }

    const newMaterial = new MaterialList({
      ...req.body,
    });

    await newMaterial.save();

    return CustomResponse(
      res,
      200,
      false,
      "Material created successfully",
      newMaterial,
    );
  } catch (error) {
    console.error(error);
    return CustomResponse(res, 500, true, "Server error");
  }
});

// Update material
router.patch("/updateMaterial/:id", async (req, res) => {
  try {
    const updatedMaterial = await MaterialList.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true },
    );

    if (!updatedMaterial) {
      return CustomResponse(res, 404, true, "Material not found");
    }

    return CustomResponse(
      res,
      200,
      false,
      "Material updated successfully",
      updatedMaterial,
    );
  } catch (error) {
    console.error(error);
    return CustomResponse(res, 500, true, "Server error");
  }
});

// Get all active materials
router.get("/getAllMaterialList", async (req, res) => {
  try {
    const materials = await MaterialList.find({
      materialStatus: 1,
    }).sort({ createdAt: -1 });

    return CustomResponse(
      res,
      200,
      false,
      "Materials fetched successfully",
      materials,
    );
  } catch (error) {
    console.error(error);
    return CustomResponse(res, 500, true, "Server error");
  }
});

// Get all materials by filters with pagination
router.post("/admin_material_list", async (req, res) => {
  try {
    const {
      page,
      per_page,
      materialName,
      type,
      materialCategory,
      materialStatus,
      specs,
    } = req.body;

    let query = {};

    // search by material name
    if (materialName) {
      query.materialName = { $regex: materialName, $options: "i" };
    }

    // filter by type
    if (type) {
      query.type = type;
    }

    // filter by category
    if (materialCategory) {
      query.materialCategory = materialCategory;
    }

    // filter by specs
    if (specs) {
      query.specs = { $regex: specs, $options: "i" };
    }

    // filter by status
    if (materialStatus !== undefined && materialStatus !== "") {
      query.materialStatus = parseInt(materialStatus);
    }

    const currentPage = page ? parseInt(page) : 1;
    const limit = per_page ? parseInt(per_page) : 10;
    const skip = (currentPage - 1) * limit;

    const materials = await MaterialList.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await MaterialList.countDocuments(query);

    const lastPage = Math.ceil(total / limit) || 1;

    const paginate = {
      total_item: total,
      showing: materials.length,
      first_page: 1,
      previous_page: currentPage > 1 ? currentPage - 1 : 1,
      current_page: currentPage,
      next_page: currentPage < lastPage ? currentPage + 1 : lastPage,
      last_page: lastPage,
    };

    return CustomResponse(res, 200, false, "Materials fetched successfully", {
      materials: materials,
      paginate,
    });
  } catch (error) {
    console.error(error);
    return CustomResponse(res, 500, true, "Server error");
  }
});

router.get("/getMaterialFilterData", async (req, res) => {
  try {
    const materials = await MaterialList.find(
      { materialStatus: 1 },
      {
        specs: 1,
        type: 1,
        materialName: 1,
        minimumOrderQuantity: 1,
        materialCategory: 1,
        vendorMaterialPrice: 1,
      },
    ).sort({ createdAt: -1 });

    const specs = materials.map((item) => ({
      _id: item._id,
      value: item.specs || "",
      minimumOrderQuantity: item.minimumOrderQuantity || "",
      materialCategory: item.materialCategory || "",
      type: item.type || "",
      material: item.materialName || "",
      vendorMaterialPrice: item.vendorMaterialPrice || 0,
    }));

    const uniqueTypes = [
      ...new Set(
        materials
          .map((item) => (item.type || "").trim())
          .filter((item) => item !== ""),
      ),
    ].map((item) => ({
      value: item,
    }));

    const uniqueMaterials = [
      ...new Set(
        materials
          .map((item) => (item.materialName || "").trim())
          .filter((item) => item !== ""),
      ),
    ].map((item) => ({
      value: item,
    }));

    return CustomResponse(
      res,
      200,
      false,
      "Material filter data fetched successfully",
      {
        specs,
        type: uniqueTypes,
        material: uniqueMaterials,
      },
    );
  } catch (error) {
    console.error(error);
    return CustomResponse(res, 500, true, "Server error");
  }
});

module.exports = router;
