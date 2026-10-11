import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// A password field with the eye button that shows / hides what was typed. `className` is the input's own class
// (the same look as the other fields of the form); the button sits inside the field on the right.
const PasswordInput = ({ className = '', ...props }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={`${className} pr-11`} />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-700"
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
};

export default PasswordInput;
