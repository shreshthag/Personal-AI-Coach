import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { storage } from "./config";

export type UploadMealImageInput = {
  uid: string;
  uri: string;
  mimeType: string;
};

export async function uploadMealImage({ uid, uri, mimeType }: UploadMealImageInput): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const extension = mimeType.includes("png") ? "png" : "jpg";
  const imageRef = ref(storage, `users/${uid}/meal-images/${Date.now()}.${extension}`);
  await uploadBytes(imageRef, blob, { contentType: mimeType });
  return getDownloadURL(imageRef);
}
