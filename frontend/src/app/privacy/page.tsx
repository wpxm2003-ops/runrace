"use client";

import { useLocale } from "@/lib/i18n";

export default function PrivacyPage() {
  const { t } = useLocale();

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 text-zinc-800">
      <h1 className="text-2xl font-bold">{t.privacy_title}</h1>
      <p className="mt-2 text-sm text-zinc-500">{t.privacy_updated}</p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t.privacy_s1_title}</h2>
        <p className="mt-2 text-sm leading-relaxed">{t.privacy_s1_body}</p>
        <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed text-zinc-700">
          <li>{t.privacy_s1_item1}</li>
          <li>{t.privacy_s1_item2}</li>
          <li>{t.privacy_s1_item3}</li>
          <li>{t.privacy_s1_item4}</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t.privacy_s2_title}</h2>
        <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed text-zinc-700">
          <li>{t.privacy_s2_item1}</li>
          <li>{t.privacy_s2_item2}</li>
          <li>{t.privacy_s2_item3}</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t.privacy_s3_title}</h2>
        <p className="mt-2 text-sm leading-relaxed">{t.privacy_s3_body}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t.privacy_s4_title}</h2>
        <p className="mt-2 text-sm leading-relaxed">{t.privacy_s4_body}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t.privacy_s5_title}</h2>
        <p className="mt-2 text-sm leading-relaxed">{t.privacy_s5_body}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t.privacy_s6_title}</h2>
        <p className="mt-2 text-sm leading-relaxed">{t.privacy_s6_body}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t.privacy_s7_title}</h2>
        <p className="mt-2 text-sm leading-relaxed">{t.privacy_s7_body}</p>
        <a
          href="mailto:heimish4982@gmail.com"
          className="mt-1 block text-sm text-zinc-900 underline"
        >
          heimish4982@gmail.com
        </a>
      </section>
    </div>
  );
}
