package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/pkg/secretutil"
	"gorm.io/gorm"
)

// ProjectRepository handles project, brand facts and competitor data
type ProjectRepository struct {
	db *gorm.DB
}

func NewProjectRepository(db *gorm.DB) *ProjectRepository {
	return &ProjectRepository{db: db}
}

func (r *ProjectRepository) GetProject(ctx context.Context, id uuid.UUID) (*ProjectModel, error) {
	var proj ProjectModel
	if err := r.db.WithContext(ctx).First(&proj, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &proj, nil
}

func (r *ProjectRepository) ListBrandFacts(ctx context.Context, projectID uuid.UUID) ([]BrandFactModel, error) {
	var facts []BrandFactModel
	err := r.db.WithContext(ctx).Where("project_id = ? AND status = 'approved'", projectID).Order("created_at desc").Scopes(PageScope(ctx)).Find(&facts).Error
	return facts, err
}

func (r *ProjectRepository) CreateBrandFact(ctx context.Context, fact *BrandFactModel) error {
	return r.db.WithContext(ctx).Create(fact).Error
}

func (r *ProjectRepository) ListCompetitors(ctx context.Context, projectID uuid.UUID) ([]CompetitorModel, error) {
	var comps []CompetitorModel
	err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Scopes(PageScope(ctx)).Find(&comps).Error
	return comps, err
}

// MonitorRepository handles queries, batch runs and snapshots
type MonitorRepository struct {
	db *gorm.DB
}

func NewMonitorRepository(db *gorm.DB) *MonitorRepository {
	return &MonitorRepository{db: db}
}

func (r *MonitorRepository) ListQueries(ctx context.Context, projectID uuid.UUID) ([]QueryModel, error) {
	var queries []QueryModel
	err := r.db.WithContext(ctx).Where("project_id = ? AND status = 'active'", projectID).Order("created_at desc").Limit(10000).Scopes(PageScope(ctx)).Find(&queries).Error
	return queries, err
}

func (r *MonitorRepository) CreateQuery(ctx context.Context, q *QueryModel) error {
	return r.db.WithContext(ctx).Create(q).Error
}

func (r *MonitorRepository) CreateRun(ctx context.Context, run *MonitorRunModel) error {
	return r.db.WithContext(ctx).Create(run).Error
}

func (r *MonitorRepository) SaveSnapshot(ctx context.Context, snap *AnswerSnapshotModel) error {
	return r.db.WithContext(ctx).Create(snap).Error
}

func (r *MonitorRepository) ListRecentSnapshots(ctx context.Context, projectID uuid.UUID, limit int) ([]AnswerSnapshotModel, error) {
	var snaps []AnswerSnapshotModel
	err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("sampled_at desc").Limit(limit).Scopes(PageScope(ctx)).Find(&snaps).Error
	return snaps, err
}

// OpportunityRepository handles opportunity evaluation & listing
type OpportunityRepository struct {
	db *gorm.DB
}

func NewOpportunityRepository(db *gorm.DB) *OpportunityRepository {
	return &OpportunityRepository{db: db}
}

func (r *OpportunityRepository) ListOpportunities(ctx context.Context, projectID uuid.UUID) ([]OpportunityModel, error) {
	var opps []OpportunityModel
	err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("score desc").Scopes(PageScope(ctx)).Find(&opps).Error
	return opps, err
}

func (r *OpportunityRepository) CreateOpportunity(ctx context.Context, opp *OpportunityModel) error {
	return r.db.WithContext(ctx).Create(opp).Error
}

func (r *OpportunityRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	return r.db.WithContext(ctx).Model(&OpportunityModel{}).Where("id = ? AND project_id = ?", id, domain.ActorFrom(ctx).ProjectID).Update("status", status).Error
}

// StrategyRepository handles strategy plans and tasks
type StrategyRepository struct {
	db *gorm.DB
}

func NewStrategyRepository(db *gorm.DB) *StrategyRepository {
	return &StrategyRepository{db: db}
}

func (r *StrategyRepository) ListStrategies(ctx context.Context, projectID uuid.UUID) ([]StrategyModel, error) {
	var list []StrategyModel
	err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("created_at desc").Scopes(PageScope(ctx)).Find(&list).Error
	return list, err
}

func (r *StrategyRepository) CreateStrategy(ctx context.Context, strat *StrategyModel) error {
	return r.db.WithContext(ctx).Create(strat).Error
}

// ContentRepository handles content factory assets
type ContentRepository struct {
	db *gorm.DB
}

func NewContentRepository(db *gorm.DB) *ContentRepository {
	return &ContentRepository{db: db}
}

func (r *ContentRepository) ListAssets(ctx context.Context, projectID uuid.UUID) ([]ContentAssetModel, error) {
	var list []ContentAssetModel
	err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("updated_at desc").Scopes(PageScope(ctx)).Find(&list).Error
	return list, err
}

func (r *ContentRepository) CreateAsset(ctx context.Context, asset *ContentAssetModel) error {
	return r.db.WithContext(ctx).Create(asset).Error
}

func (r *ContentRepository) GetAsset(ctx context.Context, id uuid.UUID) (*ContentAssetModel, error) {
	var asset ContentAssetModel
	if err := r.db.WithContext(ctx).First(&asset, "id = ? AND project_id = ?", id, domain.ActorFrom(ctx).ProjectID).Error; err != nil {
		return nil, err
	}
	return &asset, nil
}

func (r *ContentRepository) CreatePublication(ctx context.Context, pub *PublicationModel) error {
	return r.db.WithContext(ctx).Create(pub).Error
}

func (r *ContentRepository) ListPublications(ctx context.Context, projectID uuid.UUID) ([]PublicationModel, error) {
	var pubs []PublicationModel
	err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("created_at desc").Scopes(PageScope(ctx)).Find(&pubs).Error
	return pubs, err
}

// EvolutionRepository handles self-evolution runs and versioned rules
type EvolutionRepository struct {
	db *gorm.DB
}

func NewEvolutionRepository(db *gorm.DB) *EvolutionRepository {
	return &EvolutionRepository{db: db}
}

func (r *EvolutionRepository) ListRules(ctx context.Context, projectID uuid.UUID) ([]RuleModel, error) {
	var rules []RuleModel
	err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("created_at desc").Scopes(PageScope(ctx)).Find(&rules).Error
	return rules, err
}

func (r *EvolutionRepository) CreateRule(ctx context.Context, rule *RuleModel) error {
	return r.db.WithContext(ctx).Create(rule).Error
}

func (r *EvolutionRepository) ApproveRule(ctx context.Context, id uuid.UUID, newVersion string) error {
	now := time.Now()
	return r.db.WithContext(ctx).Model(&RuleModel{}).Where("id = ? AND project_id = ? AND status = 'candidate'", id, domain.ActorFrom(ctx).ProjectID).Updates(map[string]interface{}{
		"status":      "stable",
		"version":     newVersion,
		"approved_at": &now,
	}).Error
}

func (r *EvolutionRepository) RollbackRule(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&RuleModel{}).Where("id = ? AND project_id = ? AND status = 'stable'", id, domain.ActorFrom(ctx).ProjectID).Update("status", "rolled_back").Error
}

func (r *EvolutionRepository) CreateRun(ctx context.Context, run *EvolutionRunModel) error {
	return r.db.WithContext(ctx).Create(run).Error
}

// UserRepository handles user authentication and session operations
type UserRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*UserModel, error) {
	var user UserModel
	if err := r.db.WithContext(ctx).Where("email = ? AND status = 'active'", email).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) FindByID(ctx context.Context, id uuid.UUID) (*UserModel, error) {
	var user UserModel
	if err := r.db.WithContext(ctx).Where("id = ? AND status = 'active'", id).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) SaveRefreshToken(ctx context.Context, userID uuid.UUID, token string, expiresAt time.Time) error {
	rt := &RefreshTokenModel{
		BaseGormModel: BaseGormModel{ID: uuid.New()},
		UserID:        userID,
		Token:         secretutil.Digest(token),
		ExpiresAt:     expiresAt,
		Revoked:       false,
	}
	return r.db.WithContext(ctx).Create(rt).Error
}

func (r *UserRepository) ValidateAndRevokeRefreshToken(ctx context.Context, token string) (*RefreshTokenModel, error) {
	var rt RefreshTokenModel
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("token = ? AND revoked = false AND expires_at > ?", secretutil.Digest(token), time.Now()).First(&rt).Error; err != nil {
			return err
		}
		result := tx.Model(&RefreshTokenModel{}).Where("id = ? AND revoked = false", rt.ID).Update("revoked", true)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return domain.ErrConflict
		}
		return nil
	})
	return &rt, err
}

func (r *UserRepository) RotateRefreshToken(ctx context.Context, oldToken, newToken string, userID uuid.UUID, expires time.Time) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&RefreshTokenModel{}).Where("user_id = ? AND token = ? AND revoked = false AND expires_at > ?", userID, secretutil.Digest(oldToken), time.Now()).Update("revoked", true)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return domain.ErrConflict
		}
		return NewUserRepository(tx).SaveRefreshToken(ctx, userID, newToken, expires)
	})
}

func (r *UserRepository) RevokeUserRefreshTokens(ctx context.Context, userID uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&UserModel{}).Where("id = ?", userID).Update("auth_version", gorm.Expr("auth_version + 1")).Error; err != nil {
			return err
		}
		return tx.Model(&RefreshTokenModel{}).Where("user_id = ?", userID).Update("revoked", true).Error
	})
}

func (r *UserRepository) UpdateProfile(ctx context.Context, userID uuid.UUID, updates map[string]interface{}, expectedPasswordHash string) (*UserModel, error) {
	var user UserModel
	if err := r.db.WithContext(ctx).Where("id = ? AND status = 'active'", userID).First(&user).Error; err != nil {
		return nil, err
	}
	if err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		q := tx.Model(&UserModel{}).Where("id = ? AND status = 'active'", userID)
		if _, changed := updates["password_hash"]; changed {
			q = q.Where("password_hash = ?", expectedPasswordHash)
			updates["auth_version"] = gorm.Expr("auth_version + 1")
		}
		result := q.Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return domain.ErrConflict
		}
		if _, changed := updates["password_hash"]; changed {
			return tx.Model(&RefreshTokenModel{}).Where("user_id = ?", userID).Update("revoked", true).Error
		}
		return nil
	}); err != nil {
		return nil, err
	}
	if err := r.db.WithContext(ctx).Where("id = ?", userID).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}
