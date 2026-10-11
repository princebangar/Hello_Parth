import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Car,
  CheckCircle2,
  ChevronRight,
  FileText,
  ShieldCheck,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getDriverDocumentTemplates,
  getDriverVehicleTypes,
} from "../../services/registrationService";
import api from "../../../../shared/api/axiosInstance";
import { uploadService } from "../../../../shared/services/uploadService";
import {
  flattenDriverDocumentFields,
  normalizeDriverDocumentTemplates,
} from "../../utils/documentTemplates";
import { formatPlateNumber, isValidPlateNumber, PLATE_ERROR } from "../../../../shared/utils/inputFormats";

import CarIcon from "../../../../assets/icons/car.png";
import FleetDocumentFields, { buildFleetDocumentsPayload, validateFleetDocumentInputs } from "../../components/FleetDocumentFields";
import BikeIcon from "../../../../assets/icons/bike.png";
import AutoIcon from "../../../../assets/icons/auto.png";
import TruckIcon from "../../../../assets/icons/truck.png";
import EhcvIcon from "../../../../assets/icons/ehcv.png";
import HcvIcon from "../../../../assets/icons/hcv.png";
import LcvIcon from "../../../../assets/icons/LCV.png";
import McvIcon from "../../../../assets/icons/mcv.png";
import LuxuryIcon from "../../../../assets/icons/Luxury.png";
import PremiumIcon from "../../../../assets/icons/Premium.png";
import SuvIcon from "../../../../assets/icons/SUV.png";
import ScootyIcon from "../../../../assets/icons/scooty.png";
import HatchbackIcon from "../../../../assets/icons/Hatchback.png";
import BusIcon from "../../../../assets/icons/bus.png";
import MiniBusIcon from "../../../../assets/icons/mini_bus.png";
import MapBackground from "../../../../assets/map_image.png";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-blue-300 focus:ring-2 focus:ring-blue-100";
const labelClass = "mb-2 block text-[12px] font-bold text-slate-700";

const iconMap = {
  car: CarIcon,
  bike: BikeIcon,
  auto: AutoIcon,
  truck: TruckIcon,
  ehcb: EhcvIcon,
  HCV: HcvIcon,
  LCV: LcvIcon,
  MCV: McvIcon,
  Luxary: LuxuryIcon,
  premium: PremiumIcon,
  suv: SuvIcon,
  scooty: ScootyIcon,
  car_5_seater: HatchbackIcon,
  car_7_seater: SuvIcon,
  bus: BusIcon,
  mini_bus: MiniBusIcon,
};

const ICON_TYPE_ALIASES = {
  motor_bike: "bike",
  motorbike: "bike",
  mini_truck: "truck",
  "mini truck": "truck",
  pooling_truck: "truck",
  "pooling truck": "truck",
  loader: "truck",
  hcv: "HCV",
  lcv: "LCV",
  mcv: "MCV",
  luxary: "Luxary",
  luxury: "Luxary",
  scooty: "scooty",
  "car 5 seater": "car_5_seater",
  "car 7 seater": "car_7_seater",
  bus: "bus",
  "mini bus": "mini_bus",
};

const unwrap = (response) => response?.data?.data || response?.data || response;

const getVehicleTypes = (response) => {
  const data = unwrap(response);
  return data?.vehicle_types || data?.results || (Array.isArray(data) ? data : []);
};

const normalizeIconType = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "car";
  const lower = raw.toLowerCase();
  if (ICON_TYPE_ALIASES[lower]) return ICON_TYPE_ALIASES[lower];
  const exactKey = Object.keys(iconMap).find((key) => key.toLowerCase() === lower);
  return exactKey || "car";
};

const getVehicleTypeImage = (type = {}) =>
  type?.image ||
  type?.icon ||
  type?.map_icon ||
  iconMap[normalizeIconType(type?.icon_types || type?.icon_types_for || type?.name)] ||
  CarIcon;

const formatTransportType = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "both") return "Ride + Delivery";
  if (!normalized) return "Taxi";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatDispatchType = (value = "") => {
  const normalized = String(value || "normal").trim().toLowerCase();
  if (normalized === "bidding") return "Bidding";
  if (normalized === "pooling") return "Pooling";
  return "Normal";
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const getDocumentSideLabel = (field = {}) => {
  if (field.side === "front") return "Front";
  if (field.side === "back") return "Back";
  return "Document";
};

const AddVehicle = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith("/taxi/owner")
    ? "/taxi/owner"
    : "/taxi/driver";

  const [step, setStep] = useState(1);
  // Every step opens from the top (the previous step's scroll position used to stay).
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [step]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  // The typed details survive a refresh (document photos do not - they are picked again).
  const DRAFT_KEY = "helloparth:addVehicleDraft";
  const [formData, setFormData] = useState(() => {
    let draft = {};
    try {
      draft = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || "{}") || {};
    } catch {
      draft = {};
    }
    return {
      vehicleTypeId: draft.vehicleTypeId || "",
      make: draft.make || "",
      model: draft.model || "",
      number: draft.number || "",
      color: draft.color || "",
      documents: {},
    };
  });

  useEffect(() => {
    const { vehicleTypeId, make, model, number, color } = formData;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ vehicleTypeId, make, model, number, color }));
    } catch {
      /* storage blocked: the form just is not remembered */
    }
  }, [formData.vehicleTypeId, formData.make, formData.model, formData.number, formData.color]);
  // number / expiry date typed for each document template that asks for them
  const [documentMeta, setDocumentMeta] = useState({});
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [documentTemplates, setDocumentTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        setTemplatesLoading(true);

        const [typesResponse, templatesResponse] = await Promise.all([
          getDriverVehicleTypes(),
          getDriverDocumentTemplates("fleet"),
        ]);
        const types = getVehicleTypes(typesResponse);
        const templateResults =
          templatesResponse?.data?.data?.results ||
          templatesResponse?.data?.results ||
          [];

        setVehicleTypes(Array.isArray(types) ? types : []);
        setDocumentTemplates(normalizeDriverDocumentTemplates(templateResults));
      } catch (err) {
        setError("Failed to load vehicle setup");
        console.error(err);
      } finally {
        setTemplatesLoading(false);
      }
    };

    loadData();
  }, []);

  const selectedType = useMemo(
    () =>
      vehicleTypes.find(
        (type) => String(type._id || type.id) === String(formData.vehicleTypeId),
      ) || null,
    [formData.vehicleTypeId, vehicleTypes],
  );

  const canContinue =
    Boolean(formData.vehicleTypeId) &&
    Boolean(formData.make.trim()) &&
    Boolean(formData.model.trim()) &&
    isValidPlateNumber(formData.number) &&
    Boolean(formData.color.trim());

  const uploadFields = useMemo(
    () => flattenDriverDocumentFields(documentTemplates),
    [documentTemplates],
  );

  const requiredDocumentFields = useMemo(
    () => uploadFields.filter((field) => Boolean(field.isRequired)),
    [uploadFields],
  );

  const handleFileUpload = (documentKey, file) => {
    if (file) {
      setFormData((prev) => ({
        ...prev,
        documents: {
          ...(prev.documents || {}),
          [documentKey]: file,
        },
      }));
    }
  };

  const clearDocumentFile = (documentKey) => {
    setFormData((prev) => {
      const nextDocuments = { ...(prev.documents || {}) };
      delete nextDocuments[documentKey];
      return {
        ...prev,
        documents: nextDocuments,
      };
    });
  };

  const documentError = templatesLoading
    ? 'Loading'
    : validateFleetDocumentInputs(documentTemplates, formData.documents || {}, documentMeta);
  const canSubmit = !documentError;

  const handleSubmit = async () => {
    try {
      setError("");
      setIsSubmitting(true);
      const uploadedDocuments = await buildFleetDocumentsPayload(
        documentTemplates,
        formData.documents || {},
        documentMeta,
      );

      await api.post("/drivers/fleet/vehicles", {
        vehicleTypeId: formData.vehicleTypeId,
        make: formData.make,
        model: formData.model,
        number: formData.number,
        color: formData.color,
        documents: uploadedDocuments,
      });

      try {
        window.sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setStep(3);
      setTimeout(() => {
        navigate(`${routePrefix}/vehicle-fleet`);
      }, 5000);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to submit vehicle",
      );
      setIsSubmitting(false);
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb] p-4 pb-32 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
              <span>{routePrefix === "/taxi/owner" ? "Owner" : "Driver"}</span>
              <ChevronRight size={12} />
              <span>Vehicle Fleet</span>
              <ChevronRight size={12} />
              <span className="text-slate-700">Add Vehicle</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Add Vehicle</h1>
            <p className="mt-1 text-sm text-slate-500">
              Match the approved vehicle catalog, enter the fleet details, and upload the vehicle documents.
            </p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className={`rounded-2xl border px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.18em] transition-all ${
                step >= item
                  ? "border-blue-200 bg-blue-50 text-blue-600"
                  : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              Step {item}
            </div>
          ))}
        </div>

        {error ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {error}
          </div>
        ) : null}

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="details"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]"
            >
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-5">
                  <h2 className="text-lg font-bold text-slate-900">Vehicle Details</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Use the same vehicle type your drivers will operate under in the taxi system.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className={labelClass}>Vehicle Type *</label>
                    <select
                      value={formData.vehicleTypeId}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          vehicleTypeId: event.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="">Select Vehicle Type</option>
                      {vehicleTypes.map((type) => (
                        <option key={type._id || type.id} value={type._id || type.id}>
                          {type.name || type.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      Pick the catalog entry that matches this vehicle's service class.
                    </p>
                  </div>

                  <div>
                    <label className={labelClass}>Vehicle Brand *</label>
                    <input
                      value={formData.make}
                      onChange={(event) =>
                        setFormData((prev) => ({ ...prev, make: event.target.value }))
                      }
                      placeholder="Brand name, e.g. Honda, Hyundai, Bajaj"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Vehicle Model *</label>
                    <input
                      value={formData.model}
                      onChange={(event) =>
                        setFormData((prev) => ({ ...prev, model: event.target.value }))
                      }
                      placeholder="Model name, e.g. Activa, Swift, RE"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>License Plate Number *</label>
                    <input
                      value={formData.number}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          number: formatPlateNumber(event.target.value),
                        }))
                      }
                      placeholder="MP09AB1234"
                      className={`${inputClass} uppercase`}
                    />
                    {formData.number && !isValidPlateNumber(formData.number) ? (
                      <p className="mt-1 text-[11px] font-bold text-rose-600">{PLATE_ERROR}</p>
                    ) : null}
                  </div>

                  <div>
                    <label className={labelClass}>Vehicle Color *</label>
                    <input
                      value={formData.color}
                      onChange={(event) =>
                        setFormData((prev) => ({ ...prev, color: event.target.value }))
                      }
                      placeholder="White"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-6 py-5">
                    <h2 className="text-lg font-bold text-slate-900">Selected Vehicle Type</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      This mirrors the vehicle configuration your admins created.
                    </p>
                  </div>

                  {selectedType ? (
                    <div className="p-6">
                      <div className="rounded-[24px] border border-blue-100 bg-gradient-to-br from-white via-blue-50/40 to-slate-50 p-4 shadow-sm">
                        <div className="mb-4 flex items-center gap-4">
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm">
                            <img
                              src={getVehicleTypeImage(selectedType)}
                              alt={selectedType.name || "Vehicle type"}
                              className="h-12 w-12 object-contain"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-lg font-bold text-slate-900">
                              {selectedType.name || selectedType.label || "Vehicle"}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {selectedType.short_description ||
                                selectedType.description ||
                                "No short description available."}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                              Transport
                            </p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {formatTransportType(
                                selectedType.transport_type || selectedType.is_taxi,
                              )}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                              Dispatch
                            </p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {formatDispatchType(
                                selectedType.dispatch_type ||
                                  selectedType.trip_dispatch_type,
                              )}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                              Capacity
                            </p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {selectedType.capacity || 0}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                              Size
                            </p>
                            <p className="mt-2 text-sm font-semibold capitalize text-slate-900">
                              {selectedType.size || "Standard"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <Users size={16} className="text-blue-500" />
                            Service Notes
                          </div>
                          <div className="space-y-2 text-sm text-slate-600">
                            <p>
                              Status:{" "}
                              <span className="font-semibold text-slate-900">
                                {selectedType.active !== false &&
                                Number(selectedType.status ?? 1) !== 0
                                  ? "Active"
                                  : "Inactive"}
                              </span>
                            </p>
                            {selectedType.description ? (
                              <p>{selectedType.description}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-3">
                        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                          User Card Preview
                        </p>
                        <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-4">
                          <img
                            src={MapBackground}
                            alt="Map preview"
                            className="absolute inset-0 h-full w-full object-cover opacity-20"
                          />
                          <div className="relative flex items-center gap-4">
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50">
                              <img
                                src={getVehicleTypeImage(selectedType)}
                                alt={selectedType.name || "Vehicle"}
                                className="h-12 w-12 object-contain"
                              />
                            </div>
                            <div>
                              <p className="text-base font-bold text-slate-900">
                                {selectedType.name || "Vehicle"}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {selectedType.short_description ||
                                  "Catalog description will show here."}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6">
                      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-blue-500 shadow-sm">
                          <Car size={24} />
                        </div>
                        <p className="text-base font-semibold text-slate-800">
                          Select a vehicle type to preview it
                        </p>
                        <p className="mt-2 max-w-xs text-sm text-slate-500">
                          You'll see the transport mode, dispatch type, capacity, and description before moving ahead.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : null}

          {step === 2 ? (
            <motion.div
              key="documents"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.9fr]"
            >
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-5">
                  <h2 className="text-lg font-bold text-slate-900">Vehicle Documents</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Upload only the vehicle documents configured by admin in fleet document settings.
                  </p>
                </div>

                <div className="space-y-5 p-6">
                  {templatesLoading ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      Loading required fleet documents...
                    </div>
                  ) : uploadFields.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      No fleet vehicle documents are configured right now.
                    </div>
                  ) : (
                    <FleetDocumentFields
                      templates={documentTemplates}
                      files={formData.documents}
                      meta={documentMeta}
                      onFile={(key, file) => handleFileUpload(key, file)}
                      onClear={clearDocumentFile}
                      onMeta={(templateId, field, value) => setDocumentMeta((prev) => ({ ...prev, [templateId]: { ...(prev[templateId] || {}), [field]: value } }))}
                    />
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-6 py-5">
                    <h2 className="text-lg font-bold text-slate-900">Submission Summary</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Quick check before sending this vehicle for approval.
                    </p>
                  </div>

                  <div className="space-y-4 p-6">
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <FileText size={16} className="text-blue-500" />
                        Vehicle Summary
                      </div>
                      <div className="space-y-2 text-sm text-slate-600">
                        <p>
                          Type:{" "}
                          <span className="font-semibold text-slate-900">
                            {selectedType?.name || "Not selected"}
                          </span>
                        </p>
                        <p>
                          Brand & Model:{" "}
                          <span className="font-semibold text-slate-900">
                            {[formData.make, formData.model].filter(Boolean).join(" ")}
                          </span>
                        </p>
                        <p>
                          Plate Number:{" "}
                          <span className="font-semibold text-slate-900">
                            {formData.number || "-"}
                          </span>
                        </p>
                        <p>
                          Color:{" "}
                          <span className="font-semibold text-slate-900">
                            {formData.color || "-"}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-blue-100 bg-gradient-to-r from-white via-blue-50/30 to-white p-4">
                      <p className="text-sm font-semibold text-slate-900">
                        Approval note
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        The vehicle will be created in pending status and shown in the fleet after submission.
                      </p>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <ShieldCheck size={16} className="text-blue-500" />
                        Document Summary
                      </div>
                      <div className="space-y-2 text-sm text-slate-600">
                        <p>
                          Configured uploads:{" "}
                          <span className="font-semibold text-slate-900">
                            {uploadFields.length}
                          </span>
                        </p>
                        <p>
                          Attached files:{" "}
                          <span className="font-semibold text-slate-900">
                            {Object.keys(formData.documents || {}).length}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}

          {step === 3 ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex min-h-[60vh] flex-col items-center justify-center rounded-[28px] border border-slate-200 bg-white px-6 text-center shadow-sm"
            >
              <div className="relative mb-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 12, stiffness: 200 }}
                  className="relative z-10 flex h-24 w-24 items-center justify-center rounded-[28px] bg-[#2563eb] text-white shadow-xl shadow-blue-200"
                >
                  <CheckCircle2 size={38} strokeWidth={2.5} />
                </motion.div>
                <motion.div
                  animate={{ scale: [1, 1.35, 1], opacity: [0.2, 0, 0.2] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 rounded-[28px] bg-[#2563eb]"
                />
              </div>

              <h2 className="text-3xl font-bold text-slate-900">Vehicle submitted</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
                Your vehicle has been added and sent for approval. We'll take you back to the fleet page in 5 seconds.
              </p>

              <div className="mt-8 h-2 w-56 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 5, ease: "linear" }}
                  className="h-full bg-[#2563eb]"
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {step !== 3 ? (
        <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:p-5">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            {step === 1 || step === 2 ? (
              <button
                onClick={() => (step === 2 ? setStep(1) : navigate(-1))}
                className="inline-flex h-14 items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Back
              </button>
            ) : null}

            {step === 1 ? (
              <button
                onClick={() => setStep(2)}
                disabled={!canContinue}
                className={`inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition ${
                  canContinue
                    ? "bg-[#2563eb] text-white shadow-lg shadow-blue-200 hover:bg-[#1d4ed8]"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                Next: Documents <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || isSubmitting}
                className={`inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition ${
                  canSubmit && !isSubmitting
                    ? "bg-[#2563eb] text-white shadow-lg shadow-blue-200 hover:bg-[#1d4ed8]"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit for Approval <CheckCircle2 size={16} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AddVehicle;
