import { saveGoals } from "./goalsRepository";
import { addMeal } from "./mealRepository";
import { saveWeight } from "./weightRepository";
import { readPendingWrites, removePendingWrite } from "../services/cache/offlineCache";
import { uploadMealImage } from "../services/firebase/storageService";

export async function flushPendingWrites(): Promise<number> {
  const queue = await readPendingWrites();
  let synced = 0;

  for (const write of queue) {
    try {
      if (write.kind === "meal") {
        const imageUrl =
          write.meal.imageUri && write.meal.imageMimeType
            ? await uploadMealImage({
                uid: write.uid,
                uri: write.meal.imageUri,
                mimeType: write.meal.imageMimeType
              })
            : undefined;
        await addMeal(write.uid, write.meal, imageUrl, write.id);
      }

      if (write.kind === "weight") {
        await saveWeight(write.uid, write.weight);
      }

      if (write.kind === "goals") {
        await saveGoals(write.uid, write.goals);
      }

      await removePendingWrite(write.id);
      synced += 1;
    } catch {
      break;
    }
  }

  return synced;
}
