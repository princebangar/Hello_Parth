import ZoneSetup from "../ZoneSetup"

/**
 * The map location picker is the same screen as the phone (it needs Google Maps). It already has a wide layout with its
 * own title and back button, so only its phone-style top bar is hidden (see .rt-embed in desktop.css).
 */
export default function DesktopZoneSetup() {
  return (
    <div className="rt-embed -mx-8 -my-7">
      <ZoneSetup />
    </div>
  )
}
