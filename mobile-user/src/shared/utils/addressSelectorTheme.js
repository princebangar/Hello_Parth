export function resolveAddressSelectorUi(locationState) {
  const from = String(locationState?.from || locationState?.returnTo || "");
  if (locationState?.ui === "taxi" || from.startsWith("/taxi")) {
    return "taxi";
  }
  return "food";
}

export function getAddressSelectorTheme(variant = "food") {
  if (variant === "taxi") {
    return {
      variant: "taxi",
      page: "min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] dark:bg-background flex flex-col font-sans",
      pageForm:
        "fixed inset-0 z-50 bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] dark:bg-background flex flex-col h-screen overflow-hidden font-sans",
      header:
        "flex-shrink-0 bg-white/70 dark:bg-card backdrop-blur-md border-b border-white/70 dark:border-border px-5 py-4 flex items-center gap-3",
      headerEyebrow: "text-[10px] font-black uppercase tracking-[0.26em] text-slate-400",
      headerTitle: "text-[18px] font-black text-slate-900 dark:text-foreground tracking-tight leading-none",
      headerTitleSimple: "text-xl font-black text-slate-900 dark:text-foreground tracking-tight",
      accentText: "text-indigo-600 dark:text-indigo-400",
      accentTextBold: "font-bold text-indigo-600 dark:text-indigo-400 text-[15px]",
      accentBgSoft: "bg-indigo-50 dark:bg-indigo-950/30",
      accentSpinner: "border-indigo-600",
      accentSpinnerAlt: "border-b-2 border-indigo-600",
      suggestionHover: "hover:bg-indigo-50/80 dark:hover:bg-indigo-950/30",
      suggestionIconBg: "bg-indigo-50 dark:bg-indigo-950/20",
      suggestionIcon: "text-indigo-600 dark:text-indigo-400",
      locationTextBold: "font-bold text-emerald-600 dark:text-emerald-400 text-[15px]",
      locationIconBg: "bg-emerald-50 dark:bg-emerald-950/20",
      locationIcon: "text-emerald-600 dark:text-emerald-400",
      btnPrimary: "w-full h-12 text-white font-black text-base bg-slate-900 hover:bg-slate-800",
      btnPrimaryStyle: undefined,
      chipSelected: "bg-slate-900 text-white shadow-sm",
      chipUnselected:
        "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700",
      pinnedBox:
        "bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-[18px] p-4 flex gap-3",
      pinnedLabel: "text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase mb-1",
      pinnedIcon: "text-indigo-600 dark:text-indigo-400",
      inputFocus: "focus:ring-indigo-500",
      savedCard:
        "w-full flex items-start gap-3 p-4 bg-white/80 dark:bg-card backdrop-blur-md rounded-[22px] border border-white/80 dark:border-border shadow-[0_10px_24px_rgba(15,23,42,0.05)] hover:border-indigo-200/80 dark:hover:border-indigo-800 transition-colors",
      savedChevronBg: "bg-indigo-50 dark:bg-indigo-950/30",
      savedChevronIcon: "text-indigo-600 dark:text-indigo-400",
      editHover: "hover:text-indigo-600 hover:border-indigo-200 dark:hover:border-indigo-800",
      listSection:
        "bg-white/75 dark:bg-card backdrop-blur-md border-b border-white/70 dark:border-border divide-y divide-white/70 dark:divide-border",
      listRowHover: "hover:bg-white/90 dark:hover:bg-muted/40",
      searchSection: "p-4 bg-white/70 dark:bg-card backdrop-blur-md border-b border-white/70 dark:border-border",
      footerBar: "fixed left-0 right-0 p-4 bg-white/90 dark:bg-card backdrop-blur-md border-t border-white/70 dark:border-border",
      formHeaderTitleAdd: "Add Address",
      formHeaderTitleEdit: "Edit Address",
      listPageTitle: "Saved Addresses",
      listPageEyebrow: "Profile",
      toastGradient: "from-indigo-600/95 to-slate-900/95",
    };
  }

  return {
    variant: "food",
    page: "min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col",
    pageForm: "fixed inset-0 z-50 bg-white dark:bg-[#0a0a0a] flex flex-col h-screen overflow-hidden",
    header:
      "flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 py-4 flex items-center gap-4",
    headerEyebrow: "",
    headerTitle: "text-xl font-bold",
    headerTitleSimple: "text-xl font-bold",
    accentText: "text-[#DC2626]",
    accentTextBold: "font-bold text-[#DC2626] text-[15px]",
    accentBgSoft: "bg-red-50 dark:bg-red-950/10",
    accentSpinner: "border-[#DC2626]",
    accentSpinnerAlt: "border-b-2 border-[#DC2626]",
    suggestionHover: "hover:bg-[#DC2626]/5 dark:hover:bg-[#DC2626]/10",
    suggestionIconBg: "bg-red-50 dark:bg-red-950/20",
    suggestionIcon: "text-[#DC2626]",
    locationTextBold: "font-bold text-[#DC2626] text-[15px]",
    locationIconBg: "bg-red-50 dark:bg-red-950/10",
    locationIcon: "text-[#DC2626]",
    btnPrimary: "w-full h-12 text-white font-bold text-lg",
    btnPrimaryStyle: { backgroundColor: "#DC2626" },
    chipSelected: "bg-[#DC2626] text-white shadow-sm",
    chipUnselected:
      "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700",
    pinnedBox:
      "bg-[#DC2626]/5 dark:bg-[#DC2626]/10 border border-[#DC2626]/10 dark:border-[#DC2626]/20 rounded-xl p-4 flex gap-3",
    pinnedLabel: "text-xs font-bold text-[#DC2626] dark:text-[#DC2626]/80 uppercase mb-1",
    pinnedIcon: "text-[#DC2626]",
    inputFocus: "focus:ring-[#DC2626]",
    savedCard:
      "w-full flex items-start gap-3 p-4 bg-slate-50 dark:bg-[#1a1a1a] rounded-xl border border-transparent hover:border-[#DC2626]/15 transition-colors",
    savedChevronBg: "bg-[#DC2626]/10",
    savedChevronIcon: "text-[#DC2626]",
    editHover: "hover:text-[#DC2626] hover:border-[#DC2626]/30",
    listSection:
      "bg-white dark:bg-[#0a0a0a] border-b border-zinc-100 dark:border-zinc-800/60 divide-y divide-zinc-100 dark:divide-zinc-800/40",
    listRowHover: "hover:bg-zinc-50 dark:hover:bg-zinc-900/40",
    searchSection: "p-4 bg-white dark:bg-[#0a0a0a] border-b dark:border-gray-800/10",
    footerBar: "fixed left-0 right-0 p-4 bg-white dark:bg-[#1a1a1a] border-t dark:border-gray-800",
    formHeaderTitleAdd: "Add Address",
    formHeaderTitleEdit: "Edit Address",
    listPageTitle: "Select Location",
    listPageEyebrow: "",
    toastGradient: "from-[#DC2626]/95 to-[#991B1B]/95",
  };
}
