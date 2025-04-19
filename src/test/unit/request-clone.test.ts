import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import builder from '../../';

// MSWサーバーのセットアップ
const server = setupServer();

describe('fetch retry with Request object', (): void => {
    // リクエストカウンターを追跡
    let requestCount: number;

    beforeAll(() => {
        // MSWサーバーを起動
        server.listen();
    });

    afterAll(() => {
        // MSWサーバーをシャットダウン
        server.close();
    });

    beforeEach(() => {
        // 各テスト前にリクエストカウンターをリセット
        requestCount = 0;
        // ハンドラーをリセット
        server.resetHandlers();
    });

    it('should handle Request objects correctly during retries', async (): Promise<void> => {
        // リクエストハンドラーを設定
        server.use(
            http.post('https://example.test', () => {
                requestCount++;
                // 最初のリクエストでは503エラーを返す
                if (requestCount === 1) {
                    return new HttpResponse(null, {
                        status: 503,
                    });
                }
                // 2回目のリクエストでは200 OKを返す
                return HttpResponse.json({ success: true }, { status: 200 });
            }),
        );

        // 実際のfetch関数を使用
        const f = builder(fetch, { retries: 1, retryDelay: 0, retryOn: [503] });

        // 標準のRequestオブジェクトを作成
        const requestInit = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ test: 'data' }),
        };
        const requestObject = new Request('https://example.test', requestInit);

        // リクエストを実行
        const response = await f(requestObject);

        // 検証
        expect(response.status).toBe(200);
        // MSWのハンドラーが2回呼び出されたことを確認
        expect(requestCount).toBe(2);

        // レスポンスのJSONを取得して検証
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const data = await response.json();
        expect(data).toEqual({ success: true });
    });

    it('should handle multiple retries with Request objects', async (): Promise<void> => {
        // リクエストハンドラーを設定
        server.use(
            http.post('https://example.test', () => {
                requestCount++;
                // 最初のリクエストでは503エラーを返す
                if (requestCount === 1) {
                    return new HttpResponse(null, {
                        status: 503,
                    });
                }
                // 2回目のリクエストでは504エラーを返す
                if (requestCount === 2) {
                    return new HttpResponse(null, {
                        status: 504,
                    });
                }
                // 3回目のリクエストでは200 OKを返す
                return HttpResponse.json({ success: true }, { status: 200 });
            }),
        );

        // 実際のfetch関数を使用
        const f = builder(fetch, { retries: 2, retryDelay: 0, retryOn: [503, 504] });

        // 標準のRequestオブジェクトを作成
        const requestObject = new Request('https://example.test', {
            method: 'POST',
            body: JSON.stringify({ test: 'data' }),
        });

        // リクエストを実行
        const response = await f(requestObject);

        // 検証
        expect(response.status).toBe(200);
        // MSWのハンドラーが3回呼び出されたことを確認
        expect(requestCount).toBe(3);

        // レスポンスのJSONを取得して検証
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const data = await response.json();
        expect(data).toEqual({ success: true });
    });

    it('should demonstrate the issue with unusable Request objects without cloning', async (): Promise<void> => {
        // リクエストハンドラーを設定
        server.use(
            http.post('https://example.test', () => {
                requestCount++;
                // 最初のリクエストでは503エラーを返す
                if (requestCount === 1) {
                    return new HttpResponse(null, {
                        status: 503,
                    });
                }
                // 2回目のリクエストでは200 OKを返す
                return HttpResponse.json({ success: true }, { status: 200 });
            }),
        );

        // 標準のRequestオブジェクトを作成
        const requestObject = new Request('https://example.test', {
            method: 'POST',
            body: JSON.stringify({ test: 'data' }),
        });

        // Requestオブジェクトのcloneメソッドをスパイして呼び出し回数を確認
        const cloneSpy = jest.spyOn(requestObject, 'clone');

        // 実際のfetch関数を使用
        const f = builder(fetch, { retries: 1, retryDelay: 0, retryOn: [503] });

        // リクエストを実行
        const response = await f(requestObject);

        // 検証
        expect(response.status).toBe(200);
        // MSWのハンドラーが2回呼び出されたことを確認
        expect(requestCount).toBe(2);
        // Requestオブジェクトのcloneメソッドが呼び出されたことを確認
        expect(cloneSpy).toHaveBeenCalled();

        // スパイをリストア
        cloneSpy.mockRestore();
    });
});
