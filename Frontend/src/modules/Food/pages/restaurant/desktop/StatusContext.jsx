import { createContext, useContext } from "react"
import { useNavigate } from "react-router-dom"
import { BASE, Modal } from "./kit"
import { btn } from "./ui"

export const StatusContext = createContext(null)
export const useStatus = () => useContext(StatusContext)

/** The two popups the phone app shows when you try to go online outside your outlet timings. */
export function StatusDialogs({ status }) {
  const navigate = useNavigate()
  const open = status.dialog
  const close = status.closeDialog
  const go = () => {
    close()
    navigate(`${BASE}/outlet-timings`)
  }
  return (
    <Modal
      open={!!open}
      onClose={close}
      width="max-w-md"
      title={open === "day-closed" ? "Outlet Timings Closed" : "Outside Delivery Timings"}
      subtitle={open === "outside" ? "You are currently outside your scheduled delivery timings. Please change outlet timings to enable delivery status." : "Today is marked as closed in your outlet timings."}
      footer={
        <>
          <button onClick={close} className={btn.ghost}>Cancel</button>
          <button onClick={go} className={btn.primary}>{open === "day-closed" ? "Go to Outlet Timings" : "Change Outlet Timings"}</button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        {open === "day-closed" ? "Open today from Outlet timings before you go online." : "You can change your opening hours any time from Outlet timings."}
      </p>
    </Modal>
  )
}
