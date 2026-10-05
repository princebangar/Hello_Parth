/**
 * Under Maintenance — editable copy for the all-apps screen (Global admin > Customization Settings > Under Maintenance).
 * Shown in the Food (user / restaurant / delivery) and Taxi (user / driver) apps, so the wording covers both.
 * Same layout as the Food screen (Food/constants/maintenanceContent.js); icon: cloche | food-taxi | rocket | gift.
 */
export const GLOBAL_MAINTENANCE_CONTENT = {
  features: [
    {
      id: "experience",
      title: "Better Experience",
      body: "We are working hard to improve your food ordering and taxi booking experience.",
      icon: "food-taxi",
    },
    {
      id: "coming_soon",
      title: "Coming Back Soon",
      body: "We'll be back very soon with exciting new features for Food and Taxi.",
      icon: "rocket",
    },
    {
      id: "thanks",
      title: "Thank You!",
      body: "Thank you for your patience and continued support.",
      icon: "gift",
    },
  ],
};

export default GLOBAL_MAINTENANCE_CONTENT;
