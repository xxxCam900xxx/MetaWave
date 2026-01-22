import db from "../database/DatabaseLogic.js";

export async function addGroup(groupId) {
  if (!groupId) {
    throw new Error("INVALID_GROUP_ID");
  }

  try {
    await db.execute(
      "INSERT INTO signal_groups (group_id) VALUES (?)",
      [groupId]
    );

    return { success: true };
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      throw new Error("GROUP_EXISTS");
    }

    throw err;
  }
}