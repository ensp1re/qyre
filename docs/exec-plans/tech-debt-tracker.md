# Tech Debt Tracker

Debt that is real, acknowledged, and intentionally deferred.

| Date       | Area  | Debt                                                                                                 | Why deferred                        | Risk                                                             | Next trigger                                                           |
| ---------- | ----- | ---------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 2026-06-30 | build | Packages depend on built `dist` of workspace deps at runtime; typecheck uses path mapping to source. | Simple and reliable for a skeleton. | Possible drift between src and dist types if build order breaks. | When CI build ordering causes a failure, or when adding many packages. |
