//components/public/PageTitle.tsx
//公開ページの各ページにあるページタイトルコンポーネント

type PageTitleProps = {
  title: string;
  className?: string;
};

export function PageTitle({ title, className = "" }: PageTitleProps) {
  return (
    <div className={["my-8", className].join(" ")}>
      <div className="border-y-2 border-neutral-800 py-4">
        <h1 className="text-left text-2xl font-bold tracking-wide text-neutral-900 sm:text-3xl">
          {title}
        </h1>
      </div>
    </div>
  );
}