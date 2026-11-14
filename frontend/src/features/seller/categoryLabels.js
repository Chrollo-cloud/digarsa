const labels = {
  Branding: "Branding",
  "Fotografi & Film": "Photography & Film",
  "Photography & Film": "Photography & Film",
  "Web & Digital": "Web & Digital",
  "Illustration & Motion": "Illustration & Motion",
};
export const categoryLabel = category => labels[category] || category || "Uncategorized";
export const categoryValue = category => category === "Photography & Film" ? "Fotografi & Film" : category;
