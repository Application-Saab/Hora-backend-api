const fs = require("fs");

/**
 * Delay helper
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Delete a single file with retry fallback
 */
async function deleteFileWithRetry(filePath, retries = 3, delay = 300) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await fsPromises.access(filePath);
      await fsPromises.unlink(filePath);
      console.log(`Deleted: ${filePath}`);
      return true;
    } catch (err) {
      if (attempt < retries) {
        console.warn(
          `⚠️ Attempt ${attempt} failed to delete ${filePath}. Retrying...`
        );
        await sleep(delay);
      } else {
        console.error(
          `❌ Failed to delete ${filePath} after ${retries} attempts:`,
          err.message
        );
      }
    }
  }
  return false;
}

/**
 * Cleanup multiple files (with retry)
 */
exports.cleanupLocalFiles = async function (filePaths = [], retries = 3, delay = 300) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return;

  const deletePromises = filePaths
    .filter(Boolean)
    .map((file) => deleteFileWithRetry(file, retries, delay));

  await Promise.all(deletePromises);
  console.log("✅ Cleanup process finished");
};

