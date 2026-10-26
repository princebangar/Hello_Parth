// Shared lists for the dining details a restaurant gives before its dining listing is approved
// (backend keeps the same facility list in dining.service.js -> DINING_FACILITIES).

export const DINING_CUISINES = [
  "North Indian", "South Indian", "Chinese", "Italian", "Continental", "Mughlai", "Biryani", "Pizza", "Burger",
  "Fast Food", "Street Food", "Momos", "Rolls", "Sandwich", "Shawarma", "Cafe", "Bakery", "Desserts", "Ice Cream",
  "Beverages", "Juices", "Healthy Food", "Salad", "Seafood", "Mexican", "Thai", "Asian", "Punjabi", "Gujarati",
  "Rajasthani",
]

export const DINING_FACILITIES = [
  "Indoor seating", "Outdoor seating", "Air conditioned", "Family friendly", "Private dining", "Parking",
  "Wheelchair accessible", "Wi-Fi", "Live music", "Smoking area", "Serves alcohol", "Card payment",
]

// Cuisines a restaurant picks when it joins (restaurant onboarding + admin "Add restaurant"). Dining reuses these too.
export const RESTAURANT_CUISINES = [
  "North Indian", "South Indian", "Chinese", "Italian", "Continental", "Mughlai", "Biryani", "Pizza", "Burger",
  "Fast Food", "Street Food", "Momos", "Rolls", "Sandwich", "Shawarma", "Cafe", "Bakery", "Desserts", "Ice Cream",
  "Beverages", "Juices", "Healthy Food", "Salad", "Seafood", "Mexican", "Thai", "Asian", "Punjabi", "Gujarati",
  "Rajasthani",
]
export const MAX_RESTAURANT_CUISINES = 3
