import type { DateLine } from "../types.js";

export type HeroProps = {
  readonly kicker?: string;
  readonly title: string;
  readonly lede?: string;
  readonly dateline?: DateLine;
};

/**
 * Editorial masthead: kicker, large serif title, italic lede, dateline.
 */
export function Hero(props: HeroProps) {
  return (
    <section className="masthead" id="masthead">
      {props.kicker !== undefined && (
        <div className="kicker">
          <span className="kicker-dot" />
          {props.kicker}
        </div>
      )}
      <h1 className="display-title">{props.title}</h1>
      {props.lede !== undefined && <p className="lede">{props.lede}</p>}
      {props.dateline !== undefined && (
        <p className="dateline">
          {props.dateline.openedAt !== undefined && (
            <>
              Opened{" "}
              <time dateTime={props.dateline.openedAt}>
                {props.dateline.openedAtLabel ?? props.dateline.openedAt}
              </time>
            </>
          )}
          {props.dateline.openedBy !== undefined && <> by {props.dateline.openedBy}</>}
          {props.dateline.generatedAt !== undefined && (
            <>
              {" · "}
              <span className="muted">
                generated{" "}
                <time dateTime={props.dateline.generatedAt}>
                  {props.dateline.generatedAtLabel ?? props.dateline.generatedAt}
                </time>
              </span>
            </>
          )}
        </p>
      )}
    </section>
  );
}
