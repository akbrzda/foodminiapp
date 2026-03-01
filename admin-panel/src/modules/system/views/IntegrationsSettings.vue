<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Интеграции" description="Настройки внешних сервисов и управление синхронизацией">
          <template #actions>
            <Button variant="secondary" :disabled="isBusy()" @click="loadAll">
              <RefreshCcw :size="16" />
              Обновить
            </Button>
            <Button :disabled="isBusy()" @click="saveSettings">
              <RefreshCcw v-if="saving" class="h-4 w-4 animate-spin" />
              <PlugZap v-else :size="16" />
              {{ saving ? "Сохранение..." : "Сохранить" }}
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <Tabs v-model="activeTab">
      <TabsList>
        <TabsTrigger value="iiko">iiko</TabsTrigger>
        <TabsTrigger value="premiumbonus">PremiumBonus</TabsTrigger>
        <TabsTrigger value="status">Статус</TabsTrigger>
        <TabsTrigger value="queues">Очереди</TabsTrigger>
        <TabsTrigger value="logs">Логи</TabsTrigger>
      </TabsList>
    </Tabs>

    <Card v-show="activeTab === 'iiko'">
      <CardHeader>
        <CardTitle>iiko</CardTitle>
        <CardDescription>Настройки подключения и синхронизации</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div v-if="loading && !settingsLoaded" class="space-y-4">
          <div class="grid gap-4 md:grid-cols-2">
            <Skeleton class="h-16 w-full" />
            <Skeleton class="h-16 w-full" />
            <Skeleton class="h-16 w-full" />
            <Skeleton class="h-16 w-full" />
          </div>
          <Skeleton class="h-32 w-full" />
          <div class="flex gap-2">
            <Skeleton class="h-9 w-32" />
            <Skeleton class="h-9 w-44" />
          </div>
        </div>
        <template v-else>
          <div class="hidden" aria-hidden="true">
            <input type="text" tabindex="-1" autocomplete="username" />
            <input type="password" tabindex="-1" autocomplete="current-password" />
          </div>
          <FieldGroup class="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>Включено</FieldLabel>
              <FieldContent>
                <Select v-model="form.iiko_enabled">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="true">Да</SelectItem>
                    <SelectItem :value="false">Нет</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>API URL</FieldLabel>
              <FieldContent>
                <Input
                  v-model="form.iiko_api_url"
                  name="iiko_api_url_settings"
                  autocomplete="section-iiko one-time-code"
                  autocapitalize="none"
                  autocorrect="off"
                  spellcheck="false"
                  data-lpignore="true"
                  data-1p-ignore="true"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>API Key</FieldLabel>
              <FieldContent>
                <Input
                  v-model="form.iiko_api_key"
                  type="password"
                  name="iiko_api_key_settings"
                  autocomplete="section-iiko new-password"
                  autocapitalize="none"
                  autocorrect="off"
                  spellcheck="false"
                  data-lpignore="true"
                  data-1p-ignore="true"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Webhook Secret</FieldLabel>
              <FieldContent>
                <Input
                  v-model="form.iiko_webhook_secret"
                  type="password"
                  name="iiko_webhook_secret_settings"
                  autocomplete="section-iiko new-password"
                  autocapitalize="none"
                  autocorrect="off"
                  spellcheck="false"
                  data-lpignore="true"
                  data-1p-ignore="true"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Внешнее меню iiko</FieldLabel>
              <FieldContent>
                <Select v-model="form.iiko_external_menu_id">
                  <SelectTrigger><SelectValue placeholder="Не выбрано (без фильтра по внешнему меню)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Не выбрано</SelectItem>
                    <SelectItem v-for="menu in iikoOverview.externalMenus" :key="menu.id" :value="menu.id">
                      {{ menu.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Категория цен iiko</FieldLabel>
              <FieldContent>
                <Select v-model="form.iiko_price_category_id">
                  <SelectTrigger><SelectValue placeholder="Не выбрано (базовые цены)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Не выбрано</SelectItem>
                    <SelectItem v-for="category in iikoOverview.priceCategories" :key="category.id" :value="category.id">
                      {{ category.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Сохранять локальные названия</FieldLabel>
              <FieldContent>
                <Select v-model="form.iiko_preserve_local_names">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="true">Да</SelectItem>
                    <SelectItem :value="false">Нет</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </FieldGroup>
          <div class="text-xs text-muted-foreground">Источник меню для синхронизации: выбранное внешнее меню iiko.</div>
          <div class="text-xs text-muted-foreground">Если выбрано "Внешнее меню iiko", синхронизация загрузит только позиции из него.</div>
          <div v-if="overviewWarningsList.length" class="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700">
            <div v-for="warning in overviewWarningsList" :key="warning">{{ warning }}</div>
          </div>
          <div v-if="menuReadiness" class="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="text-sm font-medium">Готовность интеграции</div>
              <Button type="button" variant="outline" size="sm" :disabled="readinessLoading" @click="refreshReadiness">
                <RefreshCcw :size="14" />
                Перепроверить
              </Button>
            </div>
            <div class="grid gap-2 text-xs md:grid-cols-2">
              <div class="rounded-md border border-border/60 p-2">
                <div class="font-medium">Меню</div>
                <div class="text-muted-foreground">Статус: {{ resolveReadinessLabel(menuReadiness.status) }}</div>
                <div class="text-muted-foreground">
                  Связано: {{ Number(menuReadiness.linked_count || 0) }} / {{ Number(menuReadiness.total_count || 0) }}
                </div>
                <div class="text-muted-foreground">Нужно сопоставить: {{ Number(menuReadiness.unlinked_count || 0) }}</div>
              </div>
            </div>
            <div
              v-if="menuReadiness.status === 'needs_mapping'"
              class="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700"
            >
              Интеграция включена, требуется сопоставление записей меню. Откройте блок ниже и подтвердите сопоставления.
            </div>
            <div
              v-if="menuReadiness.status === 'ready' && Number(menuReadiness.total_count || 0) > 0"
              class="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2 text-xs text-emerald-700"
            >
              Сопоставление завершено. Модуль меню готов к работе в интеграционном режиме.
            </div>
          </div>
          <Field>
            <FieldLabel>Категории для синхронизации</FieldLabel>
            <FieldContent>
              <div class="max-h-64 space-y-2 overflow-auto rounded-lg border border-border/60 p-3">
                <template v-if="overviewLoading">
                  <div v-for="index in 6" :key="`iiko-category-skeleton-${index}`" class="flex items-center justify-between gap-3">
                    <Skeleton class="h-4 w-40" />
                    <Skeleton class="h-4 w-16" />
                    <Skeleton class="h-4 w-4" />
                  </div>
                </template>
                <label v-for="category in iikoOverview.categories" :key="category.id" class="flex items-center justify-between gap-3 text-sm">
                  <span class="truncate">{{ category.name }}</span>
                  <span class="text-xs text-muted-foreground">{{ category.products_count }} блюд</span>
                  <input v-model="form.iiko_sync_category_ids" type="checkbox" :value="category.id" class="h-4 w-4" />
                </label>
                <div v-if="!overviewLoading && !iikoOverview.categories.length" class="text-xs text-muted-foreground">
                  Категории недоступны. Нажмите "Тест iiko" или проверьте настройки доступа.
                </div>
              </div>
              <div class="mt-2 flex gap-2">
                <Button type="button" variant="outline" size="sm" @click="form.iiko_sync_category_ids = []">Все категории</Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  :disabled="!iikoOverview.categories.length"
                  @click="form.iiko_sync_category_ids = iikoOverview.categories.map((cat) => cat.id)"
                >
                  Выбрать все
                </Button>
              </div>
              <div class="mt-2 text-xs text-muted-foreground">Выбрано категорий: {{ form.iiko_sync_category_ids.length || 0 }}</div>
            </FieldContent>
          </Field>
          <div class="flex flex-wrap gap-2">
            <Button variant="secondary" :disabled="testLoading.iiko" @click="testIiko">
              <PlugZap :size="16" />
              Тест iiko
            </Button>
            <Button variant="secondary" :disabled="manualLoading.menu" @click="syncMenuNow">
              <RefreshCcw :size="16" />
              Синхронизировать меню
            </Button>
            <Button variant="secondary" :disabled="manualLoading.stoplist" @click="syncStopListNow">
              <RefreshCcw :size="16" />
              Синхронизировать стоп-лист
            </Button>
            <Button variant="secondary" :disabled="manualLoading.delivery_zones" @click="syncDeliveryZonesNow">
              <RefreshCcw :size="16" />
              Синхронизировать зоны доставки
            </Button>
          </div>
          <div class="space-y-3 rounded-lg border border-border/60 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="text-sm font-medium">Кандидаты на сопоставление</div>
              <div class="flex gap-2">
                <div class="flex h-8 items-center rounded-md border border-border/60 px-3 text-xs text-muted-foreground">Модуль: Меню</div>
                <Button type="button" variant="outline" size="sm" :disabled="mappingLoading" @click="loadMappingCandidates">
                  <RefreshCcw :size="14" />
                  Обновить
                </Button>
              </div>
            </div>
            <div v-if="mappingLoading" class="space-y-2">
              <Skeleton v-for="index in 4" :key="`mapping-skeleton-${index}`" class="h-10 w-full" />
            </div>
            <div v-else-if="mappingCandidates.length > 0" class="space-y-3">
              <div v-for="candidate in mappingCandidates" :key="candidate.id" class="rounded-lg border border-border/60 p-3">
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div class="text-xs text-muted-foreground">
                    #{{ candidate.id }} · {{ candidate.entity_type }} · {{ candidate.external_entity_id }}
                  </div>
                  <span :class="resolveCandidateStateClass(candidate.state)">{{ resolveCandidateStateLabel(candidate.state) }}</span>
                </div>
                <div class="grid gap-3 lg:grid-cols-2">
                  <div class="rounded-md border border-border/60 p-3">
                    <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Локальные данные</div>
                    <div class="space-y-1 text-xs">
                      <div class="font-medium text-foreground">
                        {{ getCandidateSideData(candidate, "local")?.name || candidate.local_name || "—" }}
                      </div>
                      <div class="text-muted-foreground">Описание: {{ getCandidateSideData(candidate, "local")?.description || "—" }}</div>
                      <div class="text-muted-foreground">Состав: {{ getCandidateSideData(candidate, "local")?.composition || "—" }}</div>
                      <div class="text-muted-foreground">Цена: {{ formatCandidatePrice(getCandidateSideData(candidate, "local")?.price) }}</div>
                      <div class="text-muted-foreground">КБЖУ: {{ formatCandidateNutrition(getCandidateSideData(candidate, "local")) }}</div>
                    </div>
                    <img
                      v-if="getCandidateSideData(candidate, 'local')?.image_url"
                      :src="getCandidateSideData(candidate, 'local')?.image_url"
                      alt="Локальное фото"
                      class="mt-2 h-20 w-20 rounded-md border border-border/60 object-cover"
                    />
                  </div>
                  <div class="rounded-md border border-border/60 p-3">
                    <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Данные iiko</div>
                    <div v-if="canResolveCandidate(candidate)" class="mb-2 space-y-2">
                      <div class="flex gap-2">
                        <Input
                          :model-value="mappingSearchByCandidate[candidate.id] || ''"
                          placeholder="Поиск блюда в iiko"
                          @update:model-value="(value) => updateCandidateSearch(candidate, value)"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          :disabled="Boolean(mappingOptionsLoadingByCandidate[candidate.id])"
                          @click="loadMappingOptionsForCandidate(candidate)"
                        >
                          Найти
                        </Button>
                      </div>
                      <Select
                        :model-value="mappingTargetByCandidate[candidate.id] || ''"
                        @update:model-value="(value) => updateCandidateTarget(candidate.id, value)"
                      >
                        <SelectTrigger class="w-full">
                          <SelectValue placeholder="Выберите позицию iiko" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem
                            v-for="option in mappingOptionsByCandidate[candidate.id] || []"
                            :key="`${candidate.id}-${option.id}`"
                            :value="String(option.id)"
                          >
                            {{ option.name }} ({{ option.external_id }})
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div class="space-y-1 text-xs">
                      <div class="font-medium text-foreground">{{ getCandidateSideData(candidate, "external")?.name || "—" }}</div>
                      <div class="text-muted-foreground">Описание: {{ getCandidateSideData(candidate, "external")?.description || "—" }}</div>
                      <div class="text-muted-foreground">Состав: {{ getCandidateSideData(candidate, "external")?.composition || "—" }}</div>
                      <div class="text-muted-foreground">Цена: {{ formatCandidatePrice(getCandidateSideData(candidate, "external")?.price) }}</div>
                      <div class="text-muted-foreground">КБЖУ: {{ formatCandidateNutrition(getCandidateSideData(candidate, "external")) }}</div>
                    </div>
                    <img
                      v-if="getCandidateSideData(candidate, 'external')?.image_url"
                      :src="getCandidateSideData(candidate, 'external')?.image_url"
                      alt="Фото iiko"
                      class="mt-2 h-20 w-20 rounded-md border border-border/60 object-cover"
                    />
                  </div>
                </div>
                <div class="mt-3 flex flex-wrap justify-end gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    :disabled="!canResolveCandidate(candidate) || !canConfirmCandidate(candidate)"
                    @click="resolveCandidate(candidate.id, 'confirm', mappingTargetByCandidate[candidate.id] || null)"
                  >
                    Подтвердить маппинг
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    :disabled="!canResolveCandidate(candidate)"
                    @click="resolveCandidate(candidate.id, 'reject')"
                  >
                    Отказаться от маппинга
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    :disabled="!canResolveCandidate(candidate)"
                    @click="resolveCandidate(candidate.id, 'ignore')"
                  >
                    Отложить решение
                  </Button>
                </div>
              </div>
            </div>
            <div v-else class="text-xs text-muted-foreground">Нет кандидатов на сопоставление для выбранного модуля.</div>
          </div>
        </template>
      </CardContent>
    </Card>

    <Card v-show="activeTab === 'premiumbonus'">
      <CardHeader>
        <CardTitle>PremiumBonus</CardTitle>
        <CardDescription>Настройки лояльности и клиентов</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div v-if="loading && !settingsLoaded" class="space-y-4">
          <div class="grid gap-4 md:grid-cols-2">
            <Skeleton class="h-16 w-full" />
            <Skeleton class="h-16 w-full" />
            <Skeleton class="h-16 w-full" />
            <Skeleton class="h-16 w-full" />
          </div>
          <Skeleton class="h-9 w-40" />
        </div>
        <template v-else>
          <div class="hidden" aria-hidden="true">
            <input type="text" tabindex="-1" autocomplete="username" />
            <input type="password" tabindex="-1" autocomplete="current-password" />
          </div>
          <FieldGroup class="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>Включено</FieldLabel>
              <FieldContent>
                <Select v-model="form.premiumbonus_enabled">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="true">Да</SelectItem>
                    <SelectItem :value="false">Нет</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Sale Point ID</FieldLabel>
              <FieldContent>
                <Input v-model="form.premiumbonus_sale_point_id" />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>API URL</FieldLabel>
              <FieldContent>
                <Input
                  v-model="form.premiumbonus_api_url"
                  name="premiumbonus_api_url_settings"
                  autocomplete="section-premiumbonus one-time-code"
                  autocapitalize="none"
                  autocorrect="off"
                  spellcheck="false"
                  data-lpignore="true"
                  data-1p-ignore="true"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>API Token</FieldLabel>
              <FieldContent>
                <Input
                  v-model="form.premiumbonus_api_token"
                  type="password"
                  name="premiumbonus_api_token_settings"
                  autocomplete="section-premiumbonus new-password"
                  autocapitalize="none"
                  autocorrect="off"
                  spellcheck="false"
                  data-lpignore="true"
                  data-1p-ignore="true"
                />
              </FieldContent>
            </Field>
          </FieldGroup>
          <div class="flex gap-2">
            <Button variant="secondary" :disabled="testLoading.pb" @click="testPb">
              <PlugZap :size="16" />
              Тест PremiumBonus
            </Button>
          </div>
        </template>
      </CardContent>
    </Card>

    <Card v-show="activeTab === 'status'">
      <CardHeader>
        <CardTitle>Статус синхронизации</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3 text-sm">
        <div v-if="statusLoading && !statusLoaded" class="grid gap-3 md:grid-cols-3">
          <div v-for="index in 3" :key="`status-skeleton-${index}`" class="rounded-lg border border-border/60 p-3">
            <Skeleton class="mb-2 h-4 w-24" />
            <Skeleton class="mb-1 h-4 w-20" />
            <Skeleton class="mb-1 h-4 w-20" />
            <Skeleton class="mb-1 h-4 w-20" />
            <Skeleton class="h-4 w-20" />
          </div>
        </div>
        <div v-else class="grid gap-3 md:grid-cols-3">
          <div class="rounded-lg border border-border/60 p-3">
            <div class="font-medium">Заказы iiko</div>
            <div class="text-muted-foreground">synced: {{ syncStatus.iikoOrders?.synced || 0 }}</div>
            <div class="text-muted-foreground">pending: {{ syncStatus.iikoOrders?.pending || 0 }}</div>
            <div class="text-muted-foreground">error: {{ syncStatus.iikoOrders?.error || 0 }}</div>
            <div class="text-muted-foreground">failed: {{ syncStatus.iikoOrders?.failed || 0 }}</div>
          </div>
          <div class="rounded-lg border border-border/60 p-3">
            <div class="font-medium">Клиенты PB</div>
            <div class="text-muted-foreground">synced: {{ syncStatus.premiumbonusClients?.synced || 0 }}</div>
            <div class="text-muted-foreground">pending: {{ syncStatus.premiumbonusClients?.pending || 0 }}</div>
            <div class="text-muted-foreground">error: {{ syncStatus.premiumbonusClients?.error || 0 }}</div>
            <div class="text-muted-foreground">failed: {{ syncStatus.premiumbonusClients?.failed || 0 }}</div>
          </div>
          <div class="rounded-lg border border-border/60 p-3">
            <div class="font-medium">Покупки PB</div>
            <div class="text-muted-foreground">synced: {{ syncStatus.premiumbonusPurchases?.synced || 0 }}</div>
            <div class="text-muted-foreground">pending: {{ syncStatus.premiumbonusPurchases?.pending || 0 }}</div>
            <div class="text-muted-foreground">error: {{ syncStatus.premiumbonusPurchases?.error || 0 }}</div>
            <div class="text-muted-foreground">failed: {{ syncStatus.premiumbonusPurchases?.failed || 0 }}</div>
          </div>
        </div>
        <Button variant="secondary" :disabled="retryLoading" @click="retryFailed">
          <RefreshCcw :size="16" />
          Повторить pending/error
        </Button>
      </CardContent>
    </Card>

    <Card v-show="activeTab === 'queues'">
      <CardHeader>
        <CardTitle>Очереди интеграции</CardTitle>
        <CardDescription>Текущее состояние очередей BullMQ</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Очередь</TableHead>
              <TableHead>waiting</TableHead>
              <TableHead>active</TableHead>
              <TableHead>completed</TableHead>
              <TableHead>failed</TableHead>
              <TableHead>delayed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="queuesLoading && !queuesLoaded" v-for="index in 5" :key="`queue-skeleton-${index}`">
              <TableCell><Skeleton class="h-4 w-32" /></TableCell>
              <TableCell><Skeleton class="h-4 w-8" /></TableCell>
              <TableCell><Skeleton class="h-4 w-8" /></TableCell>
              <TableCell><Skeleton class="h-4 w-8" /></TableCell>
              <TableCell><Skeleton class="h-4 w-8" /></TableCell>
              <TableCell><Skeleton class="h-4 w-8" /></TableCell>
            </TableRow>
            <TableRow v-for="queue in queues" :key="queue.key">
              <TableCell class="font-medium">{{ queue.key }}</TableCell>
              <TableCell>{{ queue.stats.waiting || 0 }}</TableCell>
              <TableCell>{{ queue.stats.active || 0 }}</TableCell>
              <TableCell>{{ queue.stats.completed || 0 }}</TableCell>
              <TableCell>{{ queue.stats.failed || 0 }}</TableCell>
              <TableCell>{{ queue.stats.delayed || 0 }}</TableCell>
            </TableRow>
            <TableRow v-if="!queuesLoading && !queues.length">
              <TableCell colspan="6" class="text-center text-muted-foreground">Нет данных по очередям</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Card v-show="activeTab === 'logs'">
      <CardHeader>
        <CardTitle>Логи синхронизации</CardTitle>
        <CardDescription>Последние события обмена с внешними API</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Время</TableHead>
              <TableHead>Интеграция</TableHead>
              <TableHead>Модуль</TableHead>
              <TableHead>Действие</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Ошибка</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="logsLoading && !logsLoaded" v-for="index in 6" :key="`logs-skeleton-${index}`">
              <TableCell><Skeleton class="h-4 w-32" /></TableCell>
              <TableCell><Skeleton class="h-4 w-16" /></TableCell>
              <TableCell><Skeleton class="h-4 w-16" /></TableCell>
              <TableCell><Skeleton class="h-4 w-20" /></TableCell>
              <TableCell><Skeleton class="h-4 w-14" /></TableCell>
              <TableCell><Skeleton class="h-4 w-36" /></TableCell>
            </TableRow>
            <TableRow v-for="log in syncLogs" :key="log.id">
              <TableCell class="text-xs">{{ formatDateTime(log.created_at) }}</TableCell>
              <TableCell>{{ log.integration_type }}</TableCell>
              <TableCell>{{ log.module }}</TableCell>
              <TableCell>{{ log.action }}</TableCell>
              <TableCell>
                <span :class="resolveLogStatusClass(log.status)">{{ log.status }}</span>
              </TableCell>
              <TableCell class="max-w-[340px] truncate text-xs text-muted-foreground">{{ log.error_message || "—" }}</TableCell>
            </TableRow>
            <TableRow v-if="!logsLoading && !syncLogs.length">
              <TableCell colspan="6" class="text-center text-muted-foreground">Логи отсутствуют</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog :open="onboardingDialogOpen" @update:open="onboardingDialogOpen = $event">
      <DialogContent class="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>Первичное включение интеграции iiko</DialogTitle>
          <DialogDescription>Найдены локальные записи без внешних ID. Выберите сценарий первичной настройки.</DialogDescription>
        </DialogHeader>
        <div class="space-y-3 text-sm">
          <div class="rounded-md border border-border/60 p-3">
            <div class="font-medium">Слить (с сопоставлением)</div>
            <div class="text-xs text-muted-foreground">Синхронизирует меню, предложит сопоставления и сохранит локальные маркетинговые поля.</div>
          </div>
          <div class="rounded-md border border-border/60 p-3">
            <div class="font-medium">Очистить локальные данные (DELETE)</div>
            <div class="text-xs text-muted-foreground">Полностью удалит локальный каталог и загрузит меню из iiko.</div>
          </div>
          <div class="rounded-md border border-border/60 p-3">
            <div class="font-medium">Отложить</div>
            <div class="text-xs text-muted-foreground">Интеграция останется включенной, но модуль получит статус «требуется сопоставление».</div>
          </div>
        </div>
        <div class="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" :disabled="onboardingLoading" @click="runOnboarding('defer')">Отложить</Button>
          <Button type="button" variant="outline" :disabled="onboardingLoading" @click="runOnboarding('delete')"
            >Очистить локальные данные (DELETE)</Button
          >
          <Button type="button" :disabled="onboardingLoading" @click="runOnboarding('merge')">Слить с сопоставлением</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { PlugZap, RefreshCcw } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import Button from "@/shared/components/ui/button/Button.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardDescription from "@/shared/components/ui/card/CardDescription.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import Input from "@/shared/components/ui/input/Input.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";

const { showErrorNotification, showSuccessNotification } = useNotifications();

const loading = ref(false);
const settingsLoaded = ref(false);
const activeTab = ref("iiko");
const saving = ref(false);
const retryLoading = ref(false);
const overviewLoading = ref(false);
const manualLoading = ref({ menu: false, stoplist: false, delivery_zones: false });
const testLoading = ref({ iiko: false, pb: false });
const form = ref({
  iiko_enabled: false,
  iiko_api_url: "",
  iiko_api_key: "",
  iiko_webhook_secret: "",
  iiko_sync_category_ids: [],
  iiko_external_menu_id: "",
  iiko_price_category_id: "",
  iiko_preserve_local_names: true,
  premiumbonus_enabled: false,
  premiumbonus_api_url: "",
  premiumbonus_api_token: "",
  premiumbonus_sale_point_id: "",
  integration_mode: { menu: "local", orders: "local", loyalty: "local" },
});
const iikoOverview = ref({
  categories: [],
  externalMenus: [],
  priceCategories: [],
  warnings: {},
  selectedCategoryIds: [],
  selectedExternalMenuId: "",
  selectedPriceCategoryId: "",
});
const syncStatus = ref({});
const statusLoading = ref(false);
const statusLoaded = ref(false);
const queues = ref([]);
const queuesLoading = ref(false);
const queuesLoaded = ref(false);
const syncLogs = ref([]);
const logsLoading = ref(false);
const logsLoaded = ref(false);
const overviewWarningsList = ref([]);
const overviewRequestTimer = ref(null);
const liveRefreshTimer = ref(null);
const liveRefreshing = ref(false);
const readinessLoading = ref(false);
const readinessLoaded = ref(false);
const readiness = ref({ provider: "iiko", modules: {}, rows: [] });
const mappingLoading = ref(false);
const mappingCandidates = ref([]);
const mappingSearchByCandidate = ref({});
const mappingTargetByCandidate = ref({});
const mappingOptionsByCandidate = ref({});
const mappingOptionsLoadingByCandidate = ref({});
const onboardingDialogOpen = ref(false);
const onboardingLoading = ref(false);
const currentIikoEnabled = ref(false);

const menuReadiness = computed(() => readiness.value?.modules?.menu || null);
const stopListReadiness = computed(() => readiness.value?.modules?.stoplist || null);

const formatDateTime = (value) => {
  if (!value) return "—";
  const raw = String(value).trim();

  // Для логов интеграций сервер может отдавать ISO-дату в UTC,
  // но фактически время уже локальное. Убираем TZ-суффикс,
  // чтобы не получать повторный сдвиг (+N часов) в браузере.
  const normalized = raw
    .replace("T", " ")
    .replace(/(\.\d+)?Z$/, "")
    .replace(/([+-]\d{2}:\d{2})$/, "");

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("ru-RU");
};

const resolveLogStatusClass = (status) => {
  if (status === "success") return "text-emerald-600";
  if (status === "active") return "text-amber-600";
  return "text-red-600";
};

const applyForm = (settings = {}) => {
  const categories = Array.isArray(settings.iiko_sync_category_ids)
    ? settings.iiko_sync_category_ids.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  form.value = {
    ...form.value,
    ...settings,
    iiko_enabled: Boolean(settings.iiko_enabled),
    premiumbonus_enabled: Boolean(settings.premiumbonus_enabled),
    iiko_sync_category_ids: categories,
    iiko_external_menu_id: String(settings.iiko_external_menu_id || ""),
    iiko_price_category_id: String(settings.iiko_price_category_id || ""),
    iiko_webhook_secret: String(settings.iiko_webhook_secret || ""),
    iiko_preserve_local_names: settings.iiko_preserve_local_names !== false,
    integration_mode: settings.integration_mode || { menu: "local", orders: "local", loyalty: "local" },
  };
  currentIikoEnabled.value = Boolean(settings.iiko_enabled);
};

const resolveReadinessLabel = (status) => {
  if (status === "ready") return "Готово";
  if (status === "needs_mapping") return "Требуется сопоставление";
  return "Не настроено";
};

const resolveCandidateStateLabel = (state) => {
  if (state === "suggested") return "Предложено";
  if (state === "requires_review") return "Требует проверки";
  if (state === "confirmed") return "Подтверждено";
  if (state === "ignored") return "Игнор";
  if (state === "rejected") return "Отклонено";
  return state || "—";
};

const resolveCandidateStateClass = (state) => {
  if (state === "confirmed") return "text-emerald-600";
  if (state === "requires_review") return "text-amber-600";
  if (state === "rejected") return "text-red-600";
  if (state === "ignored") return "text-slate-500";
  return "text-blue-600";
};

const getCandidateSideData = (candidate, side) => {
  if (!candidate || typeof candidate !== "object") return null;
  if (side === "local") {
    return candidate.local_data || candidate.external_payload?.local || null;
  }
  return candidate.external_data || candidate.external_payload?.external || null;
};

const formatCandidatePrice = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${numeric.toFixed(2)} ₽`;
};

const formatCandidateNutrition = (payload) => {
  if (!payload || typeof payload !== "object") return "—";
  const calories = Number(payload.calories_per_100g);
  const proteins = Number(payload.proteins_per_100g);
  const fats = Number(payload.fats_per_100g);
  const carbs = Number(payload.carbs_per_100g);
  const hasAny = [calories, proteins, fats, carbs].some((value) => Number.isFinite(value));
  if (!hasAny) return "—";
  return `К: ${Number.isFinite(calories) ? calories.toFixed(1) : "—"}, Б: ${Number.isFinite(proteins) ? proteins.toFixed(1) : "—"}, Ж: ${
    Number.isFinite(fats) ? fats.toFixed(1) : "—"
  }, У: ${Number.isFinite(carbs) ? carbs.toFixed(1) : "—"}`;
};

const canResolveCandidate = (candidate) => {
  const state = String(candidate?.state || "");
  return state === "suggested" || state === "requires_review";
};

const canConfirmCandidate = (candidate) => {
  if (!canResolveCandidate(candidate)) return false;
  const selected = String(mappingTargetByCandidate.value[candidate.id] || "").trim();
  return Boolean(selected);
};

const loadIikoOverview = async (paramsOverride = null) => {
  overviewLoading.value = true;
  try {
    const params =
      paramsOverride && typeof paramsOverride === "object"
        ? paramsOverride
        : {
            external_menu_id: String(form.value.iiko_external_menu_id || "").trim() || undefined,
            price_category_id: String(form.value.iiko_price_category_id || "").trim() || undefined,
          };
    const { data } = await api.get("/api/admin/integrations/iiko/nomenclature-overview", { params });
    iikoOverview.value = {
      categories: data?.categories || [],
      externalMenus: data?.externalMenus || [],
      priceCategories: data?.priceCategories || [],
      warnings: data?.warnings || {},
      selectedCategoryIds: data?.selectedCategoryIds || [],
      selectedExternalMenuId: data?.selectedExternalMenuId || "",
      selectedPriceCategoryId: data?.selectedPriceCategoryId || "",
    };
    overviewWarningsList.value = Object.values(iikoOverview.value.warnings || {})
      .filter(Boolean)
      .map((value) => String(value));
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось загрузить обзор меню iiko");
  } finally {
    overviewLoading.value = false;
  }
};

const loadSettings = async () => {
  loading.value = true;
  try {
    const { data } = await api.get("/api/admin/integrations/settings");
    applyForm(data?.settings || {});
  } catch (error) {
    showErrorNotification("Не удалось загрузить настройки интеграций");
  } finally {
    settingsLoaded.value = true;
    loading.value = false;
  }
};

const loadStatus = async ({ silent = false } = {}) => {
  if (!silent || !statusLoaded.value) {
    statusLoading.value = true;
  }
  try {
    const { data } = await api.get("/api/admin/integrations/iiko/sync-status");
    syncStatus.value = data || {};
  } catch (error) {
    if (!silent) {
      showErrorNotification("Не удалось загрузить статус синхронизации");
    }
  } finally {
    statusLoaded.value = true;
    statusLoading.value = false;
  }
};

const loadReadiness = async ({ silent = false } = {}) => {
  if (!silent || !readinessLoaded.value) {
    readinessLoading.value = true;
  }
  try {
    const { data } = await api.get("/api/admin/integrations/iiko/readiness");
    readiness.value = data || { provider: "iiko", modules: {}, rows: [] };
  } catch (error) {
    if (!silent) {
      showErrorNotification("Не удалось загрузить готовность интеграции");
    }
  } finally {
    readinessLoaded.value = true;
    readinessLoading.value = false;
  }
};

const refreshReadiness = async () => {
  readinessLoading.value = true;
  try {
    await api.post("/api/admin/integrations/iiko/readiness/refresh");
    await Promise.all([loadReadiness({ silent: true }), loadMappingCandidates({ silent: true })]);
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось обновить готовность");
  } finally {
    readinessLoading.value = false;
  }
};

const loadMappingCandidates = async ({ silent = false } = {}) => {
  if (!silent) {
    mappingLoading.value = true;
  }
  try {
    const { data } = await api.get("/api/admin/integrations/iiko/mapping-candidates", {
      params: {
        module: "menu",
        page: 1,
        limit: 50,
      },
    });
    mappingCandidates.value = data?.rows || [];
    for (const candidate of mappingCandidates.value) {
      const key = Number(candidate?.id);
      if (!Number.isFinite(key)) continue;
      if (mappingSearchByCandidate.value[key] === undefined) {
        mappingSearchByCandidate.value[key] = "";
      }
      if (mappingTargetByCandidate.value[key] === undefined) {
        const fromContext = String(candidate?.external_context?.target_local_id || "").trim();
        mappingTargetByCandidate.value[key] = fromContext || "";
      }
      if (!Array.isArray(mappingOptionsByCandidate.value[key])) {
        mappingOptionsByCandidate.value[key] = [];
      }
    }
  } catch (error) {
    if (!silent) {
      showErrorNotification("Не удалось загрузить кандидаты сопоставления");
    }
  } finally {
    mappingLoading.value = false;
  }
};

const updateCandidateSearch = (candidate, value) => {
  mappingSearchByCandidate.value[candidate.id] = String(value || "");
};

const updateCandidateTarget = (candidateId, value) => {
  mappingTargetByCandidate.value[candidateId] = String(value || "");
};

const loadMappingOptionsForCandidate = async (candidate) => {
  const candidateId = Number(candidate?.id);
  if (!Number.isFinite(candidateId)) return;

  const entityType = String(candidate?.entity_type || "")
    .trim()
    .toLowerCase();
  if (!entityType) return;

  mappingOptionsLoadingByCandidate.value[candidateId] = true;
  try {
    const { data } = await api.get("/api/admin/integrations/iiko/mapping-options", {
      params: {
        entity_type: entityType,
        q: mappingSearchByCandidate.value[candidateId] || "",
        limit: 50,
      },
    });
    mappingOptionsByCandidate.value[candidateId] = data?.rows || [];
  } catch (error) {
    showErrorNotification("Не удалось загрузить варианты для сопоставления");
  } finally {
    mappingOptionsLoadingByCandidate.value[candidateId] = false;
  }
};

const loadQueues = async ({ silent = false } = {}) => {
  if (!silent || !queuesLoaded.value) {
    queuesLoading.value = true;
  }
  try {
    const { data } = await api.get("/api/admin/integrations/queues");
    queues.value = data?.queues || [];
  } catch (error) {
    if (!silent) {
      showErrorNotification("Не удалось загрузить список очередей");
    }
  } finally {
    queuesLoaded.value = true;
    queuesLoading.value = false;
  }
};

const loadSyncLogs = async ({ silent = false } = {}) => {
  if (!silent || !logsLoaded.value) {
    logsLoading.value = true;
  }
  try {
    const { data } = await api.get("/api/admin/integrations/sync-logs", {
      params: { page: 1, limit: 20 },
    });
    syncLogs.value = data?.rows || [];
  } catch (error) {
    if (!silent) {
      showErrorNotification("Не удалось загрузить логи синхронизации");
    }
  } finally {
    logsLoaded.value = true;
    logsLoading.value = false;
  }
};

const loadAll = async () => {
  await loadSettings();
  await Promise.all([loadStatus(), loadQueues(), loadSyncLogs(), loadReadiness()]);
  await loadMappingCandidates();
  await loadIikoOverview();
};

const refreshLiveData = async () => {
  if (liveRefreshing.value) return;
  liveRefreshing.value = true;
  try {
    await Promise.all([loadStatus({ silent: true }), loadQueues({ silent: true }), loadSyncLogs({ silent: true })]);
  } finally {
    liveRefreshing.value = false;
  }
};

const startLiveRefresh = () => {
  if (liveRefreshTimer.value) return;
  liveRefreshTimer.value = setInterval(() => {
    if (document.hidden) return;
    if (!["status", "queues", "logs"].includes(activeTab.value)) return;
    refreshLiveData();
  }, 10000);
};

const stopLiveRefresh = () => {
  if (!liveRefreshTimer.value) return;
  clearInterval(liveRefreshTimer.value);
  liveRefreshTimer.value = null;
};

const handleVisibilityChange = () => {
  if (document.hidden) return;
  refreshLiveData();
};

const saveSettings = async () => {
  const wasIikoEnabled = currentIikoEnabled.value;
  saving.value = true;
  try {
    await api.put("/api/admin/integrations/settings", { settings: form.value });
    showSuccessNotification("Настройки интеграций сохранены");
    await loadAll();

    const enabledNow = Boolean(form.value.iiko_enabled);
    const shouldOpenOnboarding =
      !wasIikoEnabled &&
      enabledNow &&
      menuReadiness.value &&
      menuReadiness.value.status === "not_configured" &&
      Number(menuReadiness.value.unlinked_count || 0) > 0;

    onboardingDialogOpen.value = shouldOpenOnboarding;
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось сохранить настройки");
  } finally {
    saving.value = false;
  }
};

const runOnboarding = async (action) => {
  onboardingLoading.value = true;
  try {
    await api.post("/api/admin/integrations/iiko/onboarding", { action });
    onboardingDialogOpen.value = false;
    showSuccessNotification("Сценарий первичной настройки выполнен");
    await Promise.all([loadReadiness(), loadMappingCandidates(), loadSyncLogs()]);
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось выполнить сценарий онбординга");
  } finally {
    onboardingLoading.value = false;
  }
};

const resolveCandidate = async (candidateId, action, targetLocalId = null) => {
  try {
    await api.post("/api/admin/integrations/iiko/mapping/resolve", {
      candidate_id: candidateId,
      action,
      target_local_id: targetLocalId,
    });
    showSuccessNotification("Статус сопоставления обновлен");
    await Promise.all([loadMappingCandidates({ silent: true }), loadReadiness({ silent: true })]);
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось обновить сопоставление");
  }
};

const testIiko = async () => {
  testLoading.value.iiko = true;
  try {
    await api.post("/api/admin/integrations/iiko/test-connection");
    showSuccessNotification("Подключение к iiko успешно");
    await loadIikoOverview();
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Ошибка подключения к iiko");
  } finally {
    testLoading.value.iiko = false;
  }
};

const testPb = async () => {
  testLoading.value.pb = true;
  try {
    await api.post("/api/admin/integrations/premiumbonus/test-connection");
    showSuccessNotification("Подключение к PremiumBonus успешно");
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Ошибка подключения к PremiumBonus");
  } finally {
    testLoading.value.pb = false;
  }
};

const syncMenuNow = async () => {
  manualLoading.value.menu = true;
  try {
    await api.post("/api/admin/integrations/iiko/sync-menu");
    showSuccessNotification("Задача синхронизации меню поставлена в очередь");
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || error?.response?.data?.reason || "Не удалось запустить синхронизацию меню");
  } finally {
    manualLoading.value.menu = false;
  }
};

const syncStopListNow = async () => {
  manualLoading.value.stoplist = true;
  try {
    await api.post("/api/admin/integrations/iiko/sync-stoplist");
    showSuccessNotification("Задача синхронизации стоп-листа поставлена в очередь");
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || error?.response?.data?.reason || "Не удалось запустить синхронизацию стоп-листа");
  } finally {
    manualLoading.value.stoplist = false;
  }
};

const syncDeliveryZonesNow = async () => {
  manualLoading.value.delivery_zones = true;
  try {
    const { data } = await api.post("/api/admin/integrations/iiko/sync-delivery-zones");
    const stats = data?.stats || {};
    const created = Number(stats.createdCount || 0);
    const updated = Number(stats.updatedCount || 0);
    const synced = Number(stats.syncedPolygons || 0);
    showSuccessNotification(`Синхронизация зон завершена: ${synced} (создано ${created}, обновлено ${updated})`);
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || error?.response?.data?.reason || "Не удалось запустить синхронизацию зон доставки");
  } finally {
    manualLoading.value.delivery_zones = false;
  }
};

const retryFailed = async () => {
  retryLoading.value = true;
  try {
    await api.post("/api/admin/integrations/retry-failed");
    showSuccessNotification("Повтор синхронизации запущен");
    await Promise.all([loadStatus(), loadQueues(), loadSyncLogs()]);
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось запустить повтор");
  } finally {
    retryLoading.value = false;
  }
};

onMounted(async () => {
  await loadAll();
  startLiveRefresh();
  document.addEventListener("visibilitychange", handleVisibilityChange);
});

onBeforeUnmount(() => {
  stopLiveRefresh();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (overviewRequestTimer.value) {
    clearTimeout(overviewRequestTimer.value);
    overviewRequestTimer.value = null;
  }
});

watch(
  () => form.value.iiko_external_menu_id,
  (next, prev) => {
    if (String(next || "") === String(prev || "")) return;
    if (overviewRequestTimer.value) {
      clearTimeout(overviewRequestTimer.value);
      overviewRequestTimer.value = null;
    }
    overviewRequestTimer.value = setTimeout(() => {
      loadIikoOverview({
        external_menu_id: String(form.value.iiko_external_menu_id || "").trim() || undefined,
        price_category_id: String(form.value.iiko_price_category_id || "").trim() || undefined,
      });
    }, 250);
  },
);

watch(
  () => form.value.iiko_price_category_id,
  (next, prev) => {
    if (String(next || "") === String(prev || "")) return;
    if (overviewRequestTimer.value) {
      clearTimeout(overviewRequestTimer.value);
      overviewRequestTimer.value = null;
    }
    overviewRequestTimer.value = setTimeout(() => {
      loadIikoOverview({
        external_menu_id: String(form.value.iiko_external_menu_id || "").trim() || undefined,
        price_category_id: String(form.value.iiko_price_category_id || "").trim() || undefined,
      });
    }, 250);
  },
);

const isBusy = () =>
  loading.value ||
  saving.value ||
  retryLoading.value ||
  manualLoading.value.menu ||
  manualLoading.value.delivery_zones ||
  testLoading.value.iiko ||
  testLoading.value.pb ||
  overviewLoading.value ||
  readinessLoading.value ||
  mappingLoading.value ||
  onboardingLoading.value;

defineExpose({
  loadAll,
  saveSettings,
  isBusy,
});
</script>
