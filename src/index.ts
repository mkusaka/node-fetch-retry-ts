/* eslint-disable sonarjs/no-nested-functions */
export type RequestDelayFunction = (attempt: number, error: Error | null, response: Response | null) => number;
export type RetryRequestFunction = (
    attempt: number,
    retries: number,
    error: Error | null,
    response: Response | null,
) => boolean;

export interface FetchRetryParams {
    retries?: number;
    retryDelay?: number | RequestDelayFunction;
    retryOn?: number[] | RetryRequestFunction;
}

function sanitize(params: FetchRetryParams, defaults: Required<FetchRetryParams>): Required<FetchRetryParams> {
    const result = { ...defaults, ...params };
    if (typeof result.retries === 'undefined') {
        result.retries = defaults.retries;
    }

    if (typeof result.retryDelay === 'undefined') {
        result.retryDelay = defaults.retryDelay;
    }

    if (typeof result.retryOn === 'undefined') {
        result.retryOn = defaults.retryOn;
    }

    return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fetchBuilder<F extends (...args: any) => Promise<any> = typeof fetch>(
    fetchFunc: F,
    params: FetchRetryParams = {},
): (input: Parameters<F>[0], init?: Parameters<F>[1] & FetchRetryParams) => ReturnType<F> {
    const defaults = sanitize(params, { retries: 3, retryDelay: 500, retryOn: [419, 503, 504] });

    return function (input: Parameters<F>[0], init?: Parameters<F>[1] & FetchRetryParams): ReturnType<F> {
        const frp = sanitize(
            {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                retries: init?.retries,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                retryDelay: init?.retryDelay,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                retryOn: init?.retryOn,
            } satisfies FetchRetryParams,
            defaults,
        );

        const retryDelayFn =
            typeof frp.retryDelay === 'function' ? frp.retryDelay : (): number => frp.retryDelay as number;

        const retryOnFn =
            typeof frp.retryOn === 'function'
                ? frp.retryOn
                : (attempt: number, retries: number, error: Error | null, response: Response | null): boolean =>
                      (!!error || !response || (frp.retryOn as number[]).includes(response.status)) &&
                      attempt < retries;

        // inputをクローンする関数
        /* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
        function cloneInput(originalInput: Parameters<F>[0]): Parameters<F>[0] {
            // Requestオブジェクトの場合はclone()メソッドを使用
            if (
                typeof originalInput === 'object' &&
                originalInput !== null &&
                'clone' in originalInput &&
                typeof originalInput.clone === 'function'
            ) {
                return originalInput.clone() as Parameters<F>[0];
            }
            // 文字列やURLの場合はそのまま返す
            return originalInput;
        }
        /* eslint-enable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */

        return new Promise(function (resolve, reject): void {
            function extendedFetch(attempt: number, clonedInput: Parameters<F>[0]): void {
                const nextClonedInput = cloneInput(clonedInput);
                fetchFunc(clonedInput, init)
                    .then(function (response: Response): void {
                        if (retryOnFn(attempt, frp.retries, null, response)) {
                            // eslint-disable-next-line @typescript-eslint/no-use-before-define
                            retry(attempt, null, response, nextClonedInput);
                        } else {
                            resolve(response);
                        }
                    })
                    .catch(function (error: unknown): void {
                        const err = error instanceof Error ? error : new Error(String(error));
                        if (retryOnFn(attempt, frp.retries, err, null)) {
                            // eslint-disable-next-line @typescript-eslint/no-use-before-define
                            retry(attempt, err, null, nextClonedInput);
                        } else {
                            reject(err);
                        }
                    });
            }

            function retry(
                attempt: number,
                error: Error | null,
                response: Response | null,
                clonedInput: Parameters<F>[0],
            ): void {
                setTimeout(
                    () => {
                        extendedFetch(++attempt, clonedInput);
                    },
                    retryDelayFn(attempt, error, response),
                );
            }

            // 初回実行時もクローンしたinputを使用
            extendedFetch(0, cloneInput(input));
        }) as ReturnType<F>;
    };
}

export default fetchBuilder;
