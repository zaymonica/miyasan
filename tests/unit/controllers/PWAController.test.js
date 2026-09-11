/**
 * PWA Controller Tests
 */

const PWAController = require('../../../controllers/PWAController');

// Mock dependencies
jest.mock('../../../config/database', () => ({
    pool: {
        execute: jest.fn()
    }
}));

jest.mock('../../../config/logger', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }
}));

const { pool } = require('../../../config/database');

describe('PWAController', () => {
    let mockReq;
    let mockRes;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockReq = {
            params: {},
            body: {},
            files: null
        };
        
        mockRes = {
            json: jest.fn().mockReturnThis(),
            status: jest.fn().mockReturnThis(),
            setHeader: jest.fn().mockReturnThis(),
            sendFile: jest.fn().mockReturnThis()
        };
    });

    describe('getManifest', () => {
        it('should return PWA manifest with default values', async () => {
            pool.execute.mockResolvedValue([[]]);

            await PWAController.getManifest(mockReq, mockRes);

            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/manifest+json');
            expect(mockRes.json).toHaveBeenCalled();
            
            const manifest = mockRes.json.mock.calls[0][0];
            expect(manifest.name).toBe('Misayan Chat');
            expect(manifest.short_name).toBe('Misayan');
            expect(manifest.start_url).toBe('/user/');
            expect(manifest.display).toBe('standalone');
        });

        it('should return manifest with custom settings', async () => {
            pool.execute.mockResolvedValue([[
                { setting_key: 'system_name', setting_value: 'Custom App' },
                { setting_key: 'pwa_theme_color', setting_value: '#FF0000' }
            ]]);

            await PWAController.getManifest(mockReq, mockRes);

            const manifest = mockRes.json.mock.calls[0][0];
            expect(manifest.name).toBe('Custom App');
            expect(manifest.theme_color).toBe('#FF0000');
        });

        it('should handle database errors gracefully', async () => {
            pool.execute.mockRejectedValue(new Error('Database error'));

            await PWAController.getManifest(mockReq, mockRes);

            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/manifest+json');
            expect(mockRes.json).toHaveBeenCalled();
            
            const manifest = mockRes.json.mock.calls[0][0];
            expect(manifest.name).toBe('Misayan Chat');
        });
    });

    describe('getIcon', () => {
        it('should return 404 when icon not found', async () => {
            mockReq.params.size = '192';
            pool.execute.mockResolvedValue([[]]);

            await PWAController.getIcon(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
        });

        it('should use default size when invalid size provided', async () => {
            mockReq.params.size = 'invalid';
            pool.execute.mockResolvedValue([[]]);

            await PWAController.getIcon(mockReq, mockRes);

            // Should query for default size 192
            expect(pool.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['pwa_icon_192']
            );
        });
    });

    describe('getSettings', () => {
        it('should return PWA settings', async () => {
            pool.execute.mockResolvedValue([[
                { setting_key: 'pwa_theme_color', setting_value: '#075E54' },
                { setting_key: 'preloader_bg_color', setting_value: '#075E54' },
                { setting_key: 'preloader_text', setting_value: 'Loading...' }
            ]]);

            await PWAController.getSettings(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalled();
            const response = mockRes.json.mock.calls[0][0];
            expect(response.success).toBe(true);
            expect(response.data.pwa_theme_color).toBe('#075E54');
            expect(response.data.preloader_text).toBe('Loading...');
        });

        it('should return empty object on error', async () => {
            pool.execute.mockRejectedValue(new Error('Database error'));

            await PWAController.getSettings(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalled();
            const response = mockRes.json.mock.calls[0][0];
            expect(response.success).toBe(true);
            expect(response.data).toEqual({});
        });
    });

    describe('updateSettings', () => {
        it('should update PWA settings', async () => {
            mockReq.body = {
                preloader_bg_color: '#FF0000',
                preloader_text: 'Custom Loading',
                pwa_theme_color: '#00FF00'
            };
            pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

            await PWAController.updateSettings(mockReq, mockRes);

            expect(pool.execute).toHaveBeenCalled();
            expect(mockRes.json).toHaveBeenCalled();
            const response = mockRes.json.mock.calls[0][0];
            expect(response.success).toBe(true);
        });

        it('should handle update errors', async () => {
            mockReq.body = {
                preloader_bg_color: '#FF0000'
            };
            pool.execute.mockRejectedValue(new Error('Database error'));

            await PWAController.updateSettings(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
        });
    });
});
