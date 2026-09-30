import mongoose from 'mongoose';

const objectId = () => new mongoose.Types.ObjectId().toString();

// Gateway / SMS / Firebase / Maps / Mail keys live in Backend/.env only (payment on/off: Global admin).
export const createDefaultThirdPartySettings = () => {
  return {
    scope: 'default',
    recharge_api: {
      enabled: '0',
      provider_name: 'RechargeKit Verify',
      base_url: 'https://verify.rechargkit.biz',
      auth_header_name: 'Authorization',
      auth_header_prefix: 'Bearer',
      api_token: '',
      token_generated_at: null,
      callback_mode: 'auto',
      callback_url: '',
      callback_secret: '',
      allowed_ip_addresses: [],
      notes: '',
      endpoints: {
        bank_verify_penny_less: '/validation/verifyBankRequest',
        bank_verify_penny_drop: '/validation/penny-drop',
        bank_verify_v3: '/validation/v3/pennyDropVerify',
        card_bin: '/validation/cardValidate',
        upi_basic: '/validation/upiBasic',
        pan_verify: '/validation/verifyPANRequest',
        dl_request: '/validation/verifyDL',
        dl_verify: '/validation/verifyDL',
        gstin_verify: '/validation/verifyGSTIN',
        rc_verify: '/validation/rcAdvanceVerify',
        upi_advance: '/validation/upiAdvanceVerify',
      },
    },
    notification_channels: [
      { _id: objectId(), topic_name: 'Trip Request', for_user: true, push_notification: true, mail: true },
      { _id: objectId(), topic_name: 'Trip Acceptance', for_user: true, push_notification: true, mail: true },
      { _id: objectId(), topic_name: 'Driver Arrival', for_user: true, push_notification: true, mail: false },
      { _id: objectId(), topic_name: 'New Message', for_user: true, push_notification: true, mail: false },
      { _id: objectId(), topic_name: 'Wallet Topup', for_user: true, push_notification: true, mail: true },
      { _id: objectId(), topic_name: 'New Bookings', for_user: false, push_notification: true, mail: true },
      { _id: objectId(), topic_name: 'System Alerts', for_user: false, push_notification: true, mail: true },
    ],
  };
};
