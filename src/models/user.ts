export type Gender = "male" | "female" | "other";
export type ActivityLevel = "sedentary" | "moderate" | "active";

export type BodyProfile = {
  heightCm: number;
  gender: Gender;
  age: number;
  activityLevel: ActivityLevel;
};

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt?: string;
  updatedAt?: string;
  coachName?: string;
  persona?: string;
  heightCm?: number;
  gender?: Gender;
  age?: number;
  activityLevel?: ActivityLevel;
};
