import { useId, useState } from "react";

export default function PasswordInput({
  autoComplete,
  label = "Password",
  ...props
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="account-password">
        <input
          {...props}
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className="field__control"
        />
        <button
          type="button"
          aria-label={`${visible ? "Hide" : "Tampilkan"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
