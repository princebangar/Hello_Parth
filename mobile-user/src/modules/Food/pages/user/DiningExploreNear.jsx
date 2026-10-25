// Native conversion of Frontend/src/modules/Food/pages/user/DiningExploreNear.jsx
// Route: /food/user/dining/explore/near-rated. Same page as DiningExplore50 on the web (copy of it); only the banner
// alt text and the filter sheet's active-tab colour (#DC2626 here, green-600 there) differ, so it renders the shared
// screen. The web's hard-coded demo restaurants are not shipped (see DiningExplore50.jsx).
import React from "react"
import { DiningExploreScreen } from "@food/pages/user/DiningExplore50"

// Using placeholder for near and top rated banner (the web's own banner image)
const nearAndTopRated = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=200&fit=crop"

export default function DiningExploreNear() {
  return <DiningExploreScreen bannerImage={nearAndTopRated} bannerAlt="Near and Top Rated" activeTabColor="#DC2626" />
}
