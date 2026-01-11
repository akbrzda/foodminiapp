-- Очистка таблиц перед вставкой
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- Удаление существующих данных
DELETE FROM branches;
DELETE FROM cities;

-- Вставка городов
INSERT INTO cities (name, latitude, longitude, is_active, gulyash_city_id) VALUES
('Когалым', 62.2667, 74.4833, TRUE, NULL),
('Москва', 55.7558, 37.6173, TRUE, NULL),
('Пенза', 53.2001, 45.0047, TRUE, NULL);

-- Вставка филиалов для Когалыма
INSERT INTO branches (city_id, name, address, latitude, longitude, phone, working_hours, is_active, gulyash_branch_id) 
SELECT 
    c.id,
    'Улица Бакинская, 6А',
    'ул. Бакинская, 6А, Когалым',
    62.2680,
    74.4850,
    '+7 (34667) 1-23-45',
    JSON_OBJECT(
        'monday', JSON_OBJECT('open', '10:15', 'close', '22:30'),
        'tuesday', JSON_OBJECT('open', '10:15', 'close', '22:30'),
        'wednesday', JSON_OBJECT('open', '10:15', 'close', '22:30'),
        'thursday', JSON_OBJECT('open', '10:15', 'close', '22:30'),
        'friday', JSON_OBJECT('open', '10:15', 'close', '22:30'),
        'saturday', JSON_OBJECT('open', '10:15', 'close', '22:30'),
        'sunday', JSON_OBJECT('open', '10:15', 'close', '22:30')
    ),
    TRUE,
    NULL
FROM cities c 
WHERE c.name = 'Когалым';

-- Вставка филиалов для Москвы
INSERT INTO branches (city_id, name, address, latitude, longitude, phone, working_hours, is_active) 
SELECT 
    c.id,
    'Арбат',
    'ул. Арбат, 10, Москва',
    55.7520,
    37.5897,
    '+7 (495) 123-45-67',
    JSON_OBJECT(
        'monday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'tuesday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'wednesday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'thursday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'friday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'saturday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'sunday', JSON_OBJECT('open', '09:00', 'close', '23:00')
    ),
    TRUE
FROM cities c 
WHERE c.name = 'Москва';

INSERT INTO branches (city_id, name, address, latitude, longitude, phone, working_hours, is_active) 
SELECT 
    c.id,
    'Тверская',
    'ул. Тверская, 15, Москва',
    55.7645,
    37.6050,
    '+7 (495) 234-56-78',
    JSON_OBJECT(
        'monday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'tuesday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'wednesday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'thursday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'friday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'saturday', JSON_OBJECT('open', '09:00', 'close', '23:00'),
        'sunday', JSON_OBJECT('open', '09:00', 'close', '23:00')
    ),
    TRUE
FROM cities c 
WHERE c.name = 'Москва';

-- Вставка филиалов для Пензы
INSERT INTO branches (city_id, name, address, latitude, longitude, phone, working_hours, is_active) 
SELECT 
    c.id,
    'Проспект Победы',
    'пр. Победы, 50, Пенза',
    53.2050,
    45.0100,
    '+7 (8412) 345-67-89',
    JSON_OBJECT(
        'monday', JSON_OBJECT('open', '10:00', 'close', '22:00'),
        'tuesday', JSON_OBJECT('open', '10:00', 'close', '22:00'),
        'wednesday', JSON_OBJECT('open', '10:00', 'close', '22:00'),
        'thursday', JSON_OBJECT('open', '10:00', 'close', '22:00'),
        'friday', JSON_OBJECT('open', '10:00', 'close', '22:00'),
        'saturday', JSON_OBJECT('open', '10:00', 'close', '22:00'),
        'sunday', JSON_OBJECT('open', '10:00', 'close', '22:00')
    ),
    TRUE
FROM cities c 
WHERE c.name = 'Пенза';
