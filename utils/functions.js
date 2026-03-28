// utils/pagination.js

const getPaginatedData = async ({ model, query, page, per_page, populate = "", sort = { createdAt: -1 } }) => {
  const currentPage = parseInt(page) || 1;
  const limit = parseInt(per_page) || 10;
  const skip = (currentPage - 1) * limit;

  // Ek saath data aur total count nikalne ke liye Promise.all best hai (Performance boost)
  const [items, total] = await Promise.all([
    model.find(query).populate(populate).sort(sort).skip(skip).limit(limit),
    model.countDocuments(query),
  ]);

  const lastPage = Math.ceil(total / limit) || 1;

  const paginate = {
    total_item: total,
    showing: items.length,
    first_page: 1,
    previous_page: currentPage > 1 ? currentPage - 1 : 1,
    current_page: currentPage,
    next_page: currentPage < lastPage ? currentPage + 1 : lastPage,
    last_page: lastPage,
  };

  return { items, paginate };
};

module.exports = getPaginatedData;